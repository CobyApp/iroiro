import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

// CSRF state + PKCE code_verifier — /start에서 쿠키로 심고 /callback에서 검증·소거.
// 로그인 왕복용 단기 쿠키(httpOnly·Lax). 세션 쿠키와 별개.
export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
export const OAUTH_RETURN_COOKIE = "oauth_return";
export const OAUTH_PAIR_COOKIE = "oauth_pair";
const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10분

// PWA 페어링 코드 형식 — base64url 32바이트(43자). 아니면 무시(cookie 미설정).
function safePairCode(value: string | null | undefined): string | null {
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

// PKCE S256: base64url(sha256(verifier)). 카카오 지원, code 가로채기 방어.
export function pkceChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function transientCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
}

// 오픈 리다이렉트 방지 — 같은 사이트 절대경로만 허용(//, 스킴, 백슬래시 거부).
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  if (value.startsWith("/api/") || value === "/login" || value.startsWith("/login")) {
    return null;
  }
  return value.slice(0, 512);
}

export function setOAuthCookies(
  response: NextResponse,
  input: {
    state: string;
    codeVerifier: string | null;
    returnTo?: string | null;
    pairCode?: string | null;
  },
): void {
  response.cookies.set(OAUTH_STATE_COOKIE, input.state, transientCookieOptions());
  if (input.codeVerifier) {
    response.cookies.set(
      OAUTH_VERIFIER_COOKIE,
      input.codeVerifier,
      transientCookieOptions(),
    );
  }
  const rt = safeReturnPath(input.returnTo);
  if (rt) response.cookies.set(OAUTH_RETURN_COOKIE, rt, transientCookieOptions());
  const pair = safePairCode(input.pairCode);
  if (pair) response.cookies.set(OAUTH_PAIR_COOKIE, pair, transientCookieOptions());
}

export function readOAuthPair(request: NextRequest): string | null {
  return safePairCode(request.cookies.get(OAUTH_PAIR_COOKIE)?.value);
}

export function readOAuthCookies(request: NextRequest): {
  state: string | null;
  codeVerifier: string | null;
} {
  return {
    state: request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null,
    codeVerifier: request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value ?? null,
  };
}

export function readOAuthReturn(request: NextRequest): string | null {
  return safeReturnPath(request.cookies.get(OAUTH_RETURN_COOKIE)?.value);
}

export function clearOAuthCookies(response: NextResponse): void {
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_VERIFIER_COOKIE);
  response.cookies.delete(OAUTH_RETURN_COOKIE);
  response.cookies.delete(OAUTH_PAIR_COOKIE);
}
