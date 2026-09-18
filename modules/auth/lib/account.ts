import "server-only";

import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import type { Account } from "@prisma/client";
import type { OAuthProvider } from "./oauth/types";
import { generateAccountCode } from "@/lib/public-code";

// 신원으로 account 조회만 — deferred creation: 신규(null)면 /signup 가입 폼으로 보낸다.
export async function findAccountByIdentity(
  provider: OAuthProvider,
  providerUserId: string,
): Promise<Account | null> {
  const existing = await db.accountIdentity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { account: true },
  });
  return existing?.account ?? null;
}

const MAX_CODE_RETRY = 3;

// 가입 폼 제출 시 account + identity 원자 생성. displayName은 검증 통과값(필수·non-null).
// 호출 측에서 신원 중복(이미 가입됨)을 먼저 findAccountByIdentity로 확인한다.
export async function createAccountFromSignup(input: {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  displayName: string;
}): Promise<Account> {
  // public_code 충돌(P2002) 재시도는 트랜잭션 *바깥*에서 — Postgres는 명시적 트랜잭션 안에서
  // 에러가 나면 tx 전체를 abort하므로(25P02) 같은 tx 안 재시도는 동작하지 않는다.
  // 시도마다 새 트랜잭션을 연다 (collection.createCollection 선례).
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            id: uuidv7(),
            email: input.email,
            displayName: input.displayName,
            publicCode: generateAccountCode(),
          },
        });
        await tx.accountIdentity.create({
          data: {
            accountId: account.id,
            provider: input.provider,
            providerUserId: input.providerUserId,
          },
        });
        return account;
      });
    } catch (error) {
      // public_code 충돌만 재시도 — 그 외 unique(신원 중복 등)는 즉시 전파.
      if (
        isUniqueViolationOn(error, "public_code") &&
        attempt < MAX_CODE_RETRY - 1
      ) {
        continue;
      }
      throw error;
    }
  }
}

// 현재 계정의 표시 닉네임 갱신. displayName은 parseNickname 통과값(호출 측 검증).
export async function updateAccountDisplayName(
  accountId: string,
  displayName: string,
): Promise<void> {
  await db.account.update({
    where: { id: accountId },
    data: { displayName, updatedAt: new Date() },
  });
}

// 아바타 R2 키 갱신. key는 호출 측에서 avatars/ 프리픽스 검증.
export async function updateAccountAvatar(
  accountId: string,
  avatarKey: string,
): Promise<void> {
  await db.account.update({
    where: { id: accountId },
    data: { avatarKey, updatedAt: new Date() },
  });
}

// 소프트 삭제 — deletedAt 기록 + 닉네임 익명화 + 세션 전부 폐기(트랜잭션).
export async function softDeleteAccount(accountId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        deletedAt: new Date(),
        displayName: "탈퇴한 회원",
        updatedAt: new Date(),
      },
    });
    await tx.accountSession.deleteMany({ where: { accountId } });
  });
}
