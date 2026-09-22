import { describe, expect, it } from "vitest";
import { catalogDb, CatalogPrisma } from "@/lib/catalog-db";
import { db } from "@/lib/db";

// 토레카 마스터가 커머스 DB(db)로 병합된 뒤 catalogDb 는 db 의 얇은 별칭이다(레거시 임포트 호환).
describe("lib/catalog-db (커머스 DB 병합 후)", () => {
  it("catalogDb 는 커머스 db 와 동일한 클라이언트다", () => {
    expect(catalogDb).toBe(db);
  });

  it("카탈로그 모델과 커머스 모델을 모두 노출한다(같은 DB)", () => {
    expect(typeof catalogDb.card.findMany).toBe("function");
    expect(typeof catalogDb.team.findMany).toBe("function");
    expect(typeof catalogDb.seriesKind.findMany).toBe("function");
    // 병합됐으므로 커머스 모델도 접근 가능
    expect(typeof catalogDb.product.findMany).toBe("function");
  });

  it("CatalogPrisma 네임스페이스(DbNull 등)를 함께 내보낸다", () => {
    expect(CatalogPrisma.DbNull).toBeDefined();
  });
});
