import { describe, expect, it } from "vitest";

import {
  generateState,
  pkceChallengeS256,
} from "@/modules/auth/lib/oauth/state";

describe("PKCE S256", () => {
  it("RFC 7636 테스트 벡터와 일치", () => {
    expect(
      pkceChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("generateState", () => {
  it("매번 고유, URL-safe", () => {
    expect(generateState()).not.toBe(generateState());
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
