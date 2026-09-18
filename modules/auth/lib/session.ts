import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import type { Account } from "@prisma/client";

// DB 세션(Lucia식) — 레슨 13·14. 쿠키엔 신원 없는 무작위 티켓, 신원은 account_session 행이 보유.
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30일 절대 만료(고정)
// 슬라이딩 연장은 v1 미적용 — RSC에서 쿠키 갱신 불가라 반쪽이 되고, 탈취 토큰 수명만 늘어남.
// 필요 시 쿠키 쓰기가 가능한 계층(Route Handler/Proxy)에서 별도 도입.

// 신원 정보 0의 무작위 티켓(쿠키 원본). 256비트 엔트로피.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

// 토큰은 해시해서 저장 — DB 유출 시 원본 토큰(=세션 자격) 복원 불가. token_hash가 곧 PK.
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  accountId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.accountSession.create({
    data: { tokenHash: hashSessionToken(token), accountId, expiresAt },
  });
  return { token, expiresAt };
}

export type ValidatedSession = { account: Account; expiresAt: Date };

// 권위 있는 검증(DAL에서 호출). 만료는 읽기 시점 거부 + 죽은 행 정리.
export async function validateSessionToken(
  token: string,
): Promise<ValidatedSession | null> {
  const sessionTokenHash = hashSessionToken(token);
  const session = await db.accountSession.findUnique({
    where: { tokenHash: sessionTokenHash },
    include: { account: true },
  });
  if (!session) return null;

  // 자연 만료 — expires_at 경과 시 거부하고 행 제거.
  if (Date.now() >= session.expiresAt.getTime()) {
    await db.accountSession
      .delete({ where: { tokenHash: sessionTokenHash } })
      .catch(() => {});
    return null;
  }

  // 탈퇴(소프트 삭제) 계정은 인증 거부.
  if (session.account.deletedAt !== null) return null;

  return { account: session.account, expiresAt: session.expiresAt };
}

// 즉시 폐기 — 행 DELETE = 즉사.
export async function invalidateSession(token: string): Promise<void> {
  await db.accountSession
    .delete({ where: { tokenHash: hashSessionToken(token) } })
    .catch(() => {});
}

// 전 기기 로그아웃 — account의 모든 세션 행 제거.
export async function invalidateAccountSessions(
  accountId: string,
): Promise<void> {
  await db.accountSession.deleteMany({ where: { accountId } });
}
