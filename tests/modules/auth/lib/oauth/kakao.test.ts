import { describe, expect, it } from "vitest";

import { normalizeKakaoProfile } from "@/modules/auth/lib/oauth/kakao";

describe("normalizeKakaoProfile", () => {
  it("id·이메일·닉네임 정규화", () => {
    expect(
      normalizeKakaoProfile({
        id: 123456,
        kakao_account: { email: "a@b.com", profile: { nickname: "철수" } },
      }),
    ).toEqual({
      providerUserId: "123456",
      email: "a@b.com",
      displayName: "철수",
    });
  });

  it("선택 필드 없으면 null", () => {
    expect(normalizeKakaoProfile({ id: 7 })).toEqual({
      providerUserId: "7",
      email: null,
      displayName: null,
    });
  });

  it("id 없으면 throw", () => {
    expect(() => normalizeKakaoProfile({})).toThrow();
  });
});
