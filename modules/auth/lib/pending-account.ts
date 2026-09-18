import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { db } from "@/lib/db";
import type { OAuthProvider } from "./oauth/types";
import { generateSessionToken, hashSessionToken } from "./session";

// 가입 대기(deferred creation) — OAuth 검증 후 닉네임 입력 전 임시 보관.
// 세션과 동일 패턴: 쿠키엔 신원 0의 무작위 토큰, claims는 pending_account 행이 보유.
// 토큰 생성·해시는 세션의 범용 유틸 재사용(이미 단위 테스트됨).
const PENDING_ACCOUNT_DURATION_MS = 1000 * 60 * 10; // 10분
export const PENDING_ACCOUNT_COOKIE = "pending_account";

export type PendingAccountClaims = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  displayName: string | null; // 제공자 닉네임(프리필용)
};

export async function createPendingAccount(
  claims: PendingAccountClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + PENDING_ACCOUNT_DURATION_MS);
  await db.pendingAccount.create({
    data: {
      tokenHash: hashSessionToken(token),
      provider: claims.provider,
      providerUserId: claims.providerUserId,
      email: claims.email,
      displayName: claims.displayName,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function readPendingAccountByToken(
  token: string,
): Promise<PendingAccountClaims | null> {
  const tokenHash = hashSessionToken(token);
  const row = await db.pendingAccount.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (Date.now() >= row.expiresAt.getTime()) {
    await db.pendingAccount.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }
  return {
    provider: row.provider as OAuthProvider,
    providerUserId: row.providerUserId,
    email: row.email,
    displayName: row.displayName,
  };
}

export async function consumePendingAccount(token: string): Promise<void> {
  await db.pendingAccount
    .delete({ where: { tokenHash: hashSessionToken(token) } })
    .catch(() => {});
}

// 쿠키 — 콜백(NextResponse)에서 심고, 액션/RSC(cookies())에서 읽는다. 단기·httpOnly·Lax.
export function setPendingAccountCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(PENDING_ACCOUNT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_ACCOUNT_DURATION_MS / 1000,
  });
}

export async function readPendingAccountToken(): Promise<string | null> {
  return (await cookies()).get(PENDING_ACCOUNT_COOKIE)?.value ?? null;
}

export async function clearPendingAccountCookie(): Promise<void> {
  (await cookies()).delete(PENDING_ACCOUNT_COOKIE);
}
