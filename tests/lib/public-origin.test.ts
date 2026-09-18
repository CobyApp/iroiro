import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { headers });

describe("publicOrigin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("APP_URL이 있으면 항상 그것을 쓴다(끝 슬래시 제거)", async () => {
    vi.stubEnv("APP_URL", "https://iroiro.club/");
    const { publicOrigin, publicUrl } = await import("@/lib/public-origin");
    const r = req("http://ip-172-31-33-217.ap-northeast-2.compute.internal:3000/api/auth/kakao/callback", {
      "x-forwarded-host": "dev.iroiro.club",
    });
    expect(publicOrigin(r)).toBe("https://iroiro.club");
    expect(publicUrl(r, "/signup").toString()).toBe("https://iroiro.club/signup");
  });

  it("APP_URL이 없으면 X-Forwarded-Host/Proto를 쓴다(컨테이너 내부 호스트 노출 방지)", async () => {
    vi.stubEnv("APP_URL", "");
    const { publicOrigin } = await import("@/lib/public-origin");
    const r = req("http://ip-172-31-33-217.ap-northeast-2.compute.internal:3000/x", {
      "x-forwarded-host": "dev.iroiro.club, 10.0.0.1",
      "x-forwarded-proto": "https",
    });
    expect(publicOrigin(r)).toBe("https://dev.iroiro.club");
  });

  it("프록시 헤더도 없으면 요청 origin으로 폴백한다(로컬 개발)", async () => {
    vi.stubEnv("APP_URL", "");
    const { publicOrigin } = await import("@/lib/public-origin");
    expect(publicOrigin(req("http://localhost:3000/api/auth/kakao"))).toBe("http://localhost:3000");
  });
});
