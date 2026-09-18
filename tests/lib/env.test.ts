import { beforeEach, describe, expect, it, vi } from "vitest";

const baseProdEnv = () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("R2_ENDPOINT", "http://localhost:9000");
  vi.stubEnv("R2_ACCESS_KEY_ID", "x");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "x");
  vi.stubEnv("R2_BUCKET", "x");
  vi.stubEnv("R2_PUBLIC_BASE", "http://localhost:9000/x");
};

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("필수 환경변수만 있으면 통과한다", async () => {
    baseProdEnv();

    await expect(import("@/lib/env")).resolves.toBeDefined();
  });

  it("선택 환경변수의 빈 문자열은 미설정으로 취급한다 (.env.local.example 복사 대비)", async () => {
    baseProdEnv();
    for (const key of [
      "APP_URL",
      "KAKAO_CLIENT_SECRET",
      "KAKAO_SCOPE",
    ]) {
      vi.stubEnv(key, "");
    }

    const mod = await import("@/lib/env");

    expect(mod.env.KAKAO_CLIENT_SECRET).toBeUndefined();
    expect(mod.env.KAKAO_SCOPE).toBeUndefined();
    expect(mod.env.APP_URL).toBeUndefined();
  });

  it("설정된 환경변수 값은 그대로 노출한다", async () => {
    baseProdEnv();
    vi.stubEnv("KAKAO_REST_API_KEY", "kakao-key");
    vi.stubEnv("APP_URL", "https://iroiro.example");

    const mod = await import("@/lib/env");

    expect(mod.env.KAKAO_REST_API_KEY).toBe("kakao-key");
    expect(mod.env.APP_URL).toBe("https://iroiro.example");
  });

  it("R2_REGION 기본값은 auto, 설정 시 그대로 노출한다", async () => {
    const { env } = await import("@/lib/env");
    expect(env.R2_REGION).toBe("auto");

    vi.resetModules();
    vi.stubEnv("R2_REGION", "ap-northeast-1");
    const mod = await import("@/lib/env");
    expect(mod.env.R2_REGION).toBe("ap-northeast-1");
  });

  it("R2_UGC_BUCKET 기본값은 iroiro-ugc-dev", async () => {
    const { env } = await import("@/lib/env");

    expect(env.R2_UGC_BUCKET).toBe("iroiro-ugc-dev");
  });


  it.each(["KAKAO_REST_API_KEY", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"])(
    "필수 OAuth 자격증명 %s 가 비면 import를 거부한다 (fail-fast)",
    async (key) => {
      baseProdEnv();
      vi.stubEnv(key, "");

      await expect(import("@/lib/env")).rejects.toThrow();
    },
  );
});
