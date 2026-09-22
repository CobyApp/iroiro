import "server-only";

import { db } from "@/lib/db";

// PWA 로그인 디바이스 페어링 — iOS 홈 화면 앱은 외부 OAuth 리다이렉트가 Safari 로 튕겨
// 세션 쿠키가 앱 컨텍스트에 안 심긴다. 앱이 만든 고엔트로피 code 를 다리로 삼아,
// Safari 에서 로그인한 계정을 앱 컨텍스트에서 세션으로 발급받는다. 1회용·단기(5분).

export const PAIRING_TTL_MS = 5 * 60 * 1000; // 5분

// 코드 형식 — base64url 32바이트(43자). 클라가 crypto.getRandomValues 로 생성.
const CODE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidPairingCode(code: string): boolean {
  return CODE_RE.test(code);
}

// OAuth 콜백(Safari)에서 로그인 성공 시 code↔account 를 남긴다. 같은 code 재사용은 덮어쓴다.
export async function createLoginPairing(
  code: string,
  accountId: string,
): Promise<void> {
  if (!isValidPairingCode(code)) return;
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  // 만료된 코드 lazy 정리(작은 표라 부담 적음).
  await db.loginPairing.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.loginPairing.upsert({
    where: { code },
    create: { code, accountId, expiresAt },
    update: { accountId, expiresAt, createdAt: new Date() },
  });
}

// 앱 컨텍스트에서 code 로 계정을 회수한다 — 1회용(삭제)·만료 검사. 없거나 만료면 null.
export async function claimLoginPairing(code: string): Promise<string | null> {
  if (!isValidPairingCode(code)) return null;
  const row = await db.loginPairing.findUnique({ where: { code } });
  if (!row) return null;
  // 1회용 — 찾는 즉시 삭제(만료여도 삭제해 정리).
  await db.loginPairing.delete({ where: { code } }).catch(() => undefined);
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.accountId;
}
