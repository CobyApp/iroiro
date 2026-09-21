import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/db.ts 와 대칭 — 카탈로그 DB 클라이언트 진입점.
describe("lib/catalog-db", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("CATALOG_DATABASE_URL", "postgresql://localhost:54322/iroiro_catalog");
  });

  it("카탈로그 모델만 가진 Prisma 클라이언트 싱글턴을 노출한다", async () => {
    const mod = await import("@/lib/catalog-db");
    expect(typeof mod.catalogDb.card.findMany).toBe("function");
    expect(typeof mod.catalogDb.team.findMany).toBe("function");
    expect(typeof mod.catalogDb.seriesKind.findMany).toBe("function");
    // 커머스 모델은 없다 — 두 DB 는 클라이언트 단위로 분리된다
    expect((mod.catalogDb as unknown as Record<string, unknown>).product).toBeUndefined();
  });

  it("CatalogPrisma 네임스페이스(DbNull 등)를 함께 내보낸다", async () => {
    const mod = await import("@/lib/catalog-db");
    expect(mod.CatalogPrisma.DbNull).toBeDefined();
  });

  it("개발 모드에서는 globalThis 캐시로 singleton 재사용", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mod1 = await import("@/lib/catalog-db");
    const mod2 = await import("@/lib/catalog-db");
    expect(mod1.catalogDb).toBe(mod2.catalogDb);
  });
});
