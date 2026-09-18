import "server-only";

import { env } from "@/lib/env";
import { pkceChallengeS256 } from "./state";
import {
  type NormalizedProfile,
  type OAuthClient,
  OAuthError,
  safeText,
} from "./types";

// 카카오 로그인(REST API). PKCE S256·state 지원. 동의항목(닉네임·이메일)은 콘솔 설정에 의존.
const AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USERINFO_URL = "https://kapi.kakao.com/v2/user/me";

type KakaoProfileRaw = {
  id?: number | string;
  kakao_account?: {
    email?: string;
    profile?: { nickname?: string };
  };
};

// 순수 정규화 — 단위 테스트 대상.
export function normalizeKakaoProfile(raw: KakaoProfileRaw): NormalizedProfile {
  if (raw.id === undefined || raw.id === null || raw.id === "") {
    throw new OAuthError("kakao", "profile", "id 없음");
  }
  return {
    providerUserId: String(raw.id),
    email: raw.kakao_account?.email ?? null,
    displayName: raw.kakao_account?.profile?.nickname ?? null,
  };
}

export function createKakaoClient(): OAuthClient {
  const clientId = env.KAKAO_REST_API_KEY;
  if (!clientId) {
    throw new Error("KAKAO_REST_API_KEY 미설정 — 카카오 로그인 비활성화 상태");
  }
  const clientSecret = env.KAKAO_CLIENT_SECRET ?? null;
  // 카카오는 동의항목을 scope로 명시해야 닉네임·이메일을 받는다(콘솔 설정만으론 불충분 — 공식 문서).
  // account_email은 비즈 앱에서만 가능 → 기본은 profile_nickname. 이메일 필요 시 KAKAO_SCOPE로 확장.
  const scope = env.KAKAO_SCOPE ?? "profile_nickname";

  return {
    provider: "kakao",
    usesPkce: true,
    createAuthorizationUrl({ redirectUri, state, codeVerifier }) {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", scope);
      if (codeVerifier) {
        url.searchParams.set("code_challenge", pkceChallengeS256(codeVerifier));
        url.searchParams.set("code_challenge_method", "S256");
      }
      return url.toString();
    },
    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
      });
      if (clientSecret) body.set("client_secret", clientSecret);
      if (codeVerifier) body.set("code_verifier", codeVerifier);

      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body,
        cache: "no-store",
      });
      if (!res.ok) throw new OAuthError("kakao", "token", await safeText(res));
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) {
        throw new OAuthError("kakao", "token", "access_token 없음");
      }
      return json.access_token;
    },
    async fetchProfile(accessToken) {
      const res = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) throw new OAuthError("kakao", "profile", await safeText(res));
      return normalizeKakaoProfile((await res.json()) as KakaoProfileRaw);
    },
  };
}
