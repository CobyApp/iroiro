import { describe, expect, it } from "vitest";

import { normalizeNaverProfile } from "@/modules/auth/lib/oauth/naver";

describe("normalizeNaverProfile", () => {
  it("response.id·email·nickname 정규화", () => {
    expect(
      normalizeNaverProfile({
        resultcode: "00",
        response: {
          id: "naver-1",
          email: "x@y.com",
          name: "영희",
          nickname: "yh",
        },
      }),
    ).toEqual({ providerUserId: "naver-1", email: "x@y.com", displayName: "yh" });
  });

  it("nickname 없으면 name 폴백", () => {
    expect(
      normalizeNaverProfile({ response: { id: "n2", name: "이름만" } }),
    ).toEqual({ providerUserId: "n2", email: null, displayName: "이름만" });
  });

  it("response.id 없으면 throw", () => {
    expect(() => normalizeNaverProfile({ response: {} })).toThrow();
  });
});
