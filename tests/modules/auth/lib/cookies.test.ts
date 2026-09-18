import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  readSessionToken,
  sessionCookieOptions,
} from "@/modules/auth/lib/cookies";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

describe("sessionCookieOptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("httpOnly·SameSite=Lax·path=/·expires 고정", () => {
    const expires = new Date("2030-01-01T00:00:00Z");
    expect(sessionCookieOptions(expires)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
    });
  });

  it("production이면 secure=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions(new Date()).secure).toBe(true);
  });

  it("비-production이면 secure=false (로컬 http 허용)", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions(new Date()).secure).toBe(false);
  });
});

describe("세션 쿠키 read/clear", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.delete.mockReset();
  });

  it("SESSION_COOKIE_NAME 은 'session'", () => {
    expect(SESSION_COOKIE_NAME).toBe("session");
  });

  it("readSessionToken: 세션 쿠키 값을 반환", async () => {
    cookieStore.get.mockReturnValue({ value: "tok-1" });
    await expect(readSessionToken()).resolves.toBe("tok-1");
    expect(cookieStore.get).toHaveBeenCalledWith("session");
  });

  it("readSessionToken: 쿠키가 없으면 null", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(readSessionToken()).resolves.toBeNull();
  });

  it("clearSessionCookie: 세션 쿠키를 삭제", async () => {
    await clearSessionCookie();
    expect(cookieStore.delete).toHaveBeenCalledWith("session");
  });
});
