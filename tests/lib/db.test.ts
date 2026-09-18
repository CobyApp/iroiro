import { beforeEach, describe, expect, it, vi } from "vitest";

describe("lib/db", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:54322/postgres");
  });

  it("BigInt.prototype.toJSON 폴리필을 설치한다 — JSON.stringify가 number로 직렬화", async () => {
    await import("@/lib/db");
    expect(JSON.stringify({ id: 42n })).toBe('{"id":42}');
  });

  it("폴리필은 큰 값도 Number 변환으로 직렬화 (safe integer 범위 내)", async () => {
    await import("@/lib/db");
    const value = { id: 9_007_199_254_740_991n };
    expect(JSON.stringify(value)).toBe('{"id":9007199254740991}');
  });

  it("PrismaClient를 default export로 제공하는 db 싱글톤을 노출한다", async () => {
    const mod = await import("@/lib/db");
    expect(mod.db).toBeDefined();
    expect(typeof mod.db.team.findMany).toBe("function");
  });

  it("개발 모드에서는 globalThis 캐시로 singleton 재사용", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mod1 = await import("@/lib/db");
    const mod2 = await import("@/lib/db");
    expect(mod1.db).toBe(mod2.db);
  });
});
