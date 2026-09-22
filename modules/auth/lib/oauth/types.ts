import "server-only";

export type OAuthProvider = "kakao";

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "kakao";
}

// 제공자 응답에서 정규화한 신원·프로필(제공자 무관 형태).
export type NormalizedProfile = {
  providerUserId: string; // account_identity.provider_user_id
  email: string | null;
  displayName: string | null;
};

export type AuthorizationUrlInput = {
  redirectUri: string;
  state: string;
  codeVerifier: string | null;
};

export type ExchangeInput = {
  code: string;
  redirectUri: string;
  state: string;
  codeVerifier: string | null;
};

// 제공자별 OAuth 클라이언트. 자격증명은 팩토리에서 env로 주입.
export interface OAuthClient {
  readonly provider: OAuthProvider;
  readonly usesPkce: boolean;
  createAuthorizationUrl(input: AuthorizationUrlInput): string;
  exchangeCode(input: ExchangeInput): Promise<string>; // access token
  fetchProfile(accessToken: string): Promise<NormalizedProfile>;
}

// OAuth 단계 에러 — 라우트가 잡아 사용자 친화 메시지로 변환.
export class OAuthError extends Error {
  constructor(
    readonly provider: OAuthProvider,
    readonly stage: "token" | "profile",
    detail: string,
  ) {
    super(`[oauth:${provider}:${stage}] ${detail}`);
    this.name = "OAuthError";
  }
}

export async function safeText(res: Response): Promise<string> {
  try {
    return `HTTP ${res.status} ${(await res.text()).slice(0, 300)}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
