import { type NextRequest, NextResponse } from "next/server";

import { publicOrigin, publicUrl } from "@/lib/public-origin";
import { findAccountByIdentity } from "@/modules/auth/lib/account";
import {
  createPendingAccount,
  setPendingAccountCookie,
} from "@/modules/auth/lib/pending-account";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/modules/auth/lib/cookies";
import {
  buildCallbackUrl,
  isOAuthProvider,
  tryGetOAuthClient,
} from "@/modules/auth/lib/oauth";
import {
  clearOAuthCookies,
  readOAuthCookies,
  readOAuthReturn,
} from "@/modules/auth/lib/oauth/state";
import { createSession } from "@/modules/auth/lib/session";

// Prisma 사용 → Node 런타임 필수(Edge 불가).
export const runtime = "nodejs";

function loginError(request: NextRequest, code: string): NextResponse {
  const response = NextResponse.redirect(
    publicUrl(request, `/login?error=${code}`),
  );
  clearOAuthCookies(response);
  return response;
}

// OAuth 콜백 — state 검증 → code 교환 → 프로필 → account 생성/연결 → 세션 발급 → 쿠키.
// GET /api/auth/{kakao|naver}/callback?code=...&state=...
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  // 사용자가 동의를 거부했거나 제공자 에러
  if (url.searchParams.get("error")) return loginError(request, "denied");
  if (!code || !returnedState) return loginError(request, "invalid_request");

  // CSRF — 쿠키 state와 콜백 state 일치 확인(불일치 시 거부).
  const { state: cookieState, codeVerifier } = readOAuthCookies(request);
  if (!cookieState || cookieState !== returnedState) {
    return loginError(request, "state_mismatch");
  }

  const client = tryGetOAuthClient(provider);
  if (!client) return loginError(request, "provider_unavailable");

  // Public origin (APP_URL → X-Forwarded-Host → request) — never the container-internal host.
  const redirectUri = buildCallbackUrl(publicOrigin(request), provider);

  try {
    const accessToken = await client.exchangeCode({
      code,
      redirectUri,
      state: returnedState,
      codeVerifier,
    });
    const profile = await client.fetchProfile(accessToken);
    const existing = await findAccountByIdentity(
      provider,
      profile.providerUserId,
    );

    if (existing) {
      // 기존 사용자 → 로그인.
      // TODO(온보딩): 전화 인증 미완료(phone_number_verified_at NULL)면 /onboarding/phone로.
      const { token, expiresAt } = await createSession(existing.id);
      const returnTo = readOAuthReturn(request) ?? "/";
      const response = NextResponse.redirect(publicUrl(request, returnTo));
      response.cookies.set(
        SESSION_COOKIE_NAME,
        token,
        sessionCookieOptions(expiresAt),
      );
      clearOAuthCookies(response);
      return response;
    }

    // 신규 신원 → account를 만들지 않고 가입 대기(닉네임 입력 후 생성, deferred creation).
    const { token: pendingToken } = await createPendingAccount({
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      displayName: profile.displayName,
    });
    const response = NextResponse.redirect(publicUrl(request, "/signup"));
    setPendingAccountCookie(response, pendingToken);
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("[oauth callback]", error);
    return loginError(request, "oauth_failed");
  }
}
