import "server-only";

import { cookies } from "next/headers";

// 세션 쿠키 — httpOnly·Secure·SameSite=Lax. localStorage 저장 금지(XSS 표적, 레슨 13).
// SameSite=Lax: OAuth 콜백(top-level navigation)에서 쿠키 세팅이 허용된다.
export const SESSION_COOKIE_NAME = "session";

type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  expires: Date;
};

// 라우트 핸들러는 `response.cookies.set(name, value, opts)`,
// Server Action은 `cookies().set(name, value, opts)`에 동일 적용.
export function sessionCookieOptions(expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}
