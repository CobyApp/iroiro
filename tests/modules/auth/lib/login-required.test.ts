import { describe, expect, it } from "vitest";
import {
  LOGIN_REQUIRED_FEATURES,
  isLoginRequiredFeature,
  loginRequiredHref,
} from "@/modules/auth/lib/login-required";

describe("login-required", () => {
  it.each(Object.keys(LOGIN_REQUIRED_FEATURES))(
    "%s 기능 키를 허용한다",
    (feature) => {
      expect(isLoginRequiredFeature(feature)).toBe(true);
    },
  );

  it.each([undefined, "", "admin", "../login", "unknown"])(
    "허용하지 않은 기능 키 %s를 거부한다",
    (feature) => {
      expect(isLoginRequiredFeature(feature)).toBe(false);
    },
  );

  it("고정된 기능 키만 안내 URL로 만든다", () => {
    expect(loginRequiredHref("checkout")).toBe(
      "/login-required?feature=checkout",
    );
  });
});
