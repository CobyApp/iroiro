import { describe, expect, it } from "vitest";

import { buildCallbackUrl, isOAuthProvider } from "@/modules/auth/lib/oauth";

describe("isOAuthProvider", () => {
  it("kakao만 통과", () => {
    expect(isOAuthProvider("kakao")).toBe(true);
    expect(isOAuthProvider("naver")).toBe(false);
    expect(isOAuthProvider("google")).toBe(false);
    expect(isOAuthProvider("")).toBe(false);
  });
});

describe("buildCallbackUrl", () => {
  it("origin·provider로 콜백 경로 구성", () => {
    expect(buildCallbackUrl("http://localhost:3000", "kakao")).toBe(
      "http://localhost:3000/api/auth/kakao/callback",
    );
  });

  it("origin 끝 슬래시는 제거 (redirect_uri 불일치 방지)", () => {
    expect(buildCallbackUrl("https://example.com/", "kakao")).toBe(
      "https://example.com/api/auth/kakao/callback",
    );
    expect(buildCallbackUrl("https://example.com///", "kakao")).toBe(
      "https://example.com/api/auth/kakao/callback",
    );
  });
});
