import { type NextRequest, NextResponse } from "next/server";

import { publicOrigin, publicUrl } from "@/lib/public-origin";
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
// GET /api/auth/{kakao}
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
      publicUrl(request, "/login?error=provider_unavailable"),
    );
  }

  const redirectUri = buildCallbackUrl(publicOrigin(request), provider);
  const state = generateState();
  const codeVerifier = client.usesPkce ? generateCodeVerifier() : null;

  const authorizationUrl = client.createAuthorizationUrl({
    redirectUri,
    state,
    codeVerifier,
  });

  const response = NextResponse.redirect(authorizationUrl);
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  // PWA(홈 화면 앱) 페어링 — 앱이 만든 code 를 쿠키로 실어 콜백까지 전달(카카오엔 안 보냄).
  const pairCode = request.nextUrl.searchParams.get("pair");
  setOAuthCookies(response, { state, codeVerifier, returnTo, pairCode });
  return response;
}
