import "server-only";

import { env } from "@/lib/env";
import {
  type NormalizedProfile,
  type OAuthClient,
  OAuthError,
  safeText,
} from "./types";

// 네이버 로그인(OAuth2). PKCE 미지원 → state(CSRF)로 방어. 토큰 요청에 state 동봉.
// 제공 정보(이름·이메일·닉네임)는 네이버 앱 콘솔 설정에 의존.
const AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize";
const TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

type NaverProfileRaw = {
  resultcode?: string;
  message?: string;
  response?: {
    id?: string;
    email?: string;
    name?: string;
    nickname?: string;
  };
};

// 순수 정규화 — 단위 테스트 대상.
export function normalizeNaverProfile(raw: NaverProfileRaw): NormalizedProfile {
  // 네이버는 resultcode "00"이 성공. 그 외는 실패 응답.
  if (raw.resultcode && raw.resultcode !== "00") {
    throw new OAuthError(
      "naver",
      "profile",
      `resultcode ${raw.resultcode}: ${raw.message ?? ""}`,
    );
  }
  const r = raw.response;
  if (!r?.id) {
    throw new OAuthError("naver", "profile", "response.id 없음");
  }
  return {
    providerUserId: r.id,
    email: r.email ?? null,
    displayName: r.nickname ?? r.name ?? null,
  };
}

export function createNaverClient(): OAuthClient {
  const clientId = env.NAVER_CLIENT_ID;
  const clientSecret = env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID/SECRET 미설정 — 네이버 로그인 비활성화 상태");
  }

  return {
    provider: "naver",
    usesPkce: false,
    createAuthorizationUrl({ redirectUri, state }) {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return url.toString();
    },
    async exchangeCode({ code, state }) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        state,
      });
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      });
      if (!res.ok) throw new OAuthError("naver", "token", await safeText(res));
      const json = (await res.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!json.access_token) {
        throw new OAuthError(
          "naver",
          "token",
          json.error_description ?? json.error ?? "access_token 없음",
        );
      }
      return json.access_token;
    },
    async fetchProfile(accessToken) {
      const res = await fetch(PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) throw new OAuthError("naver", "profile", await safeText(res));
      return normalizeNaverProfile((await res.json()) as NaverProfileRaw);
    },
  };
}
