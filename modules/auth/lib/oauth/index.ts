import "server-only";

import { createKakaoClient } from "./kakao";
import type { OAuthClient, OAuthProvider } from "./types";

export {
  type OAuthProvider,
  type NormalizedProfile,
  OAuthError,
  isOAuthProvider,
} from "./types";

// 제공자 → 클라이언트. 자격증명 미설정 시 팩토리가 throw.
export function getOAuthClient(provider: OAuthProvider): OAuthClient {
  switch (provider) {
    case "kakao":
      return createKakaoClient();
  }
}

// 자격증명 미설정이면 throw 대신 null — 라우트에서 친화적 처리.
export function tryGetOAuthClient(provider: OAuthProvider): OAuthClient | null {
  try {
    return getOAuthClient(provider);
  } catch {
    return null;
  }
}

// {origin}/api/auth/{provider}/callback — 콘솔에 등록한 Redirect URI와 정확히 일치해야 함.
// origin 끝 슬래시 제거 — APP_URL에 "/"가 붙어도 "//api/..."로 깨지지 않게(redirect_uri 불일치 방지).
export function buildCallbackUrl(
  origin: string,
  provider: OAuthProvider,
): string {
  return `${origin.replace(/\/+$/, "")}/api/auth/${provider}/callback`;
}
