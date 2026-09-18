import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import {
  buildCallbackUrl,
  isOAuthProvider,
  tryGetOAuthClient,
} from "@/modules/auth/lib/oauth";
import {
  generateCodeVerifier,
  generateState,
  setOAuthCookies,
} from "@/modules/auth/lib/oauth/state";

// node:crypto(randomBytes) 사용 → Node 런타임 명시(Edge 불가).
export const runtime = "nodejs";

// OAuth 시작 — state·PKCE 생성 후 쿠키로 심고 제공자 authorize로 302.
// GET /api/auth/{kakao|naver}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isOAuthProvider(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  const client = tryGetOAuthClient(provider);
  if (!client) {
    return NextResponse.redirect(
      new URL("/login?error=provider_unavailable", request.url),
    );
  }

  const origin = env.APP_URL ?? request.nextUrl.origin;
  const redirectUri = buildCallbackUrl(origin, provider);
  const state = generateState();
  const codeVerifier = client.usesPkce ? generateCodeVerifier() : null;

  const authorizationUrl = client.createAuthorizationUrl({
    redirectUri,
    state,
    codeVerifier,
  });

  const response = NextResponse.redirect(authorizationUrl);
  setOAuthCookies(response, { state, codeVerifier });
  return response;
}
