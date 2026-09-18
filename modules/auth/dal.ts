import "server-only";

import { cache } from "react";

import type { Account } from "@prisma/client";
import { readSessionToken } from "./lib/cookies";
import { type ValidatedSession, validateSessionToken } from "./lib/session";

// DAL — 권위 있는 세션 검증(레슨 14). Node 계층(RSC·Server Action·Route Handler)에서만.
// React cache()로 요청당 1회 메모이즈 → 한 요청에서 여러 번 불러도 DB 조회 1회.
export const getSession = cache(async (): Promise<ValidatedSession | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
});

export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const session = await getSession();
  return session?.account ?? null;
});

// 온보딩 완료 여부 — 전화 인증까지 끝난 계정인지. (전화 인증 단계는 다음 작업)
export function isOnboarded(account: Account): boolean {
  return account.phoneNumberVerifiedAt !== null;
}
