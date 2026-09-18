import { beforeEach, describe, expect, it, vi } from "vitest";

// 집계는 Prisma groupBy·raw SQL로 위임 — 여기서는 결과 재조립 로직(상태 매핑,
// N+1 트릭, 팀명 매핑, 썸네일 조인, unspecified 집계)을 검증한다.
const groupBy = vi.fn();
const productFindMany = vi.fn();
const teamFindMany = vi.fn();
const photoFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: {
      groupBy,
      findMany: productFindMany,
      // 비즈니스 스냅샷(경매 카운트) — 이 테스트의 관심사가 아니라 0 고정.
      count: vi.fn(async () => 0),
    },
    team: { findMany: teamFindMany },
    productPhoto: { findMany: photoFindMany },
    order: {
      aggregate: vi.fn(async () => ({ _sum: { totalAmount: 0 } })),
      count: vi.fn(async () => 0),
    },
    account: { count: vi.fn(async () => 0) },
    productReview: {
      aggregate: vi.fn(async () => ({
        _count: { _all: 0 },
        _avg: { rating: null },
      })),
    },
    pointTransaction: {
      aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })),
    },
    $queryRaw: queryRaw,
  },
}));

// getDashboardData의 호출 순서: groupBy(saleStatus) → findMany(재고0) →
// groupBy(teamId) → findMany(최근) → groupBy(condition)
function seed({
  statusGroups = [] as { saleStatus: string; _count: { _all: number } }[],
  outOfStockRows = [] as { id: bigint; name: string; saleStatus: string }[],
  teamGroups = [] as { teamId: bigint | null; _count: { _all: number } }[],
  recentRows = [] as {
    id: bigint;
    name: string;
    saleStatus: string;
    createdAt: Date;
  }[],
  conditionGroups = [] as {
    condition: string | null;
    _count: { _all: number };
  }[],
  teams = [] as { id: bigint; name: string }[],
  photos = [] as { productId: bigint; r2Key: string }[],
  sums = { inventory_value: 0n, purchase_cost: 0n },
} = {}) {
  groupBy
    .mockResolvedValueOnce(statusGroups)
    .mockResolvedValueOnce(teamGroups)
    .mockResolvedValueOnce(conditionGroups);
  productFindMany
    .mockResolvedValueOnce(outOfStockRows)
    .mockResolvedValueOnce(recentRows);
  teamFindMany.mockResolvedValue(teams);
  photoFindMany.mockResolvedValue(photos);
  queryRaw.mockResolvedValue([sums]);
}

beforeEach(() => {
  vi.resetModules();
  groupBy.mockReset();
  productFindMany.mockReset();
  teamFindMany.mockReset();
  photoFindMany.mockReset();
  queryRaw.mockReset();
});

describe("dashboard queries", () => {
  it("빈 결과면 모든 카운트가 0", async () => {
    seed();
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    expect(data.stats.totalProducts).toBe(0);
    expect(data.stats.inventoryValueKrw).toBe(0);
    expect(data.stats.outOfStockCount).toBe(0);
    expect(data.alerts).toEqual([]);
    expect(data.teamDistribution).toEqual([]);
    expect(data.recentProducts).toEqual([]);
  });

  it("status groupBy 결과를 byStatus·totalProducts로 매핑한다", async () => {
    seed({
      statusGroups: [
        { saleStatus: "active", _count: { _all: 2 } },
        { saleStatus: "draft", _count: { _all: 1 } },
      ],
    });
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    expect(data.stats.byStatus.active).toBe(2);
    expect(data.stats.byStatus.draft).toBe(1);
    expect(data.stats.totalProducts).toBe(3);
  });

  it("재고 가치·매입 원가는 raw SQL 합계를 Number로 노출한다", async () => {
    seed({ sums: { inventory_value: 75000n, purchase_cost: 28000n } });
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    expect(data.stats.inventoryValueKrw).toBe(75000);
    expect(data.stats.purchaseCostKrw).toBe(28000);
  });

  it("재고 0이 10건 초과면 10건만 노출 + hasMore=true (N+1 트릭)", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: BigInt(i + 1),
      name: `상품 ${i + 1}`,
      saleStatus: "active",
    }));
    seed({ outOfStockRows: rows });
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    expect(data.stats.outOfStockCount).toBe(10);
    expect(data.stats.outOfStockHasMore).toBe(true);
    expect(data.alerts).toHaveLength(10);
  });

  it("그룹 분포의 팀명은 미지정·알 수 없음까지 매핑한다", async () => {
    seed({
      teamGroups: [
        { teamId: 1n, _count: { _all: 3 } },
        { teamId: null, _count: { _all: 2 } },
        { teamId: 99n, _count: { _all: 1 } },
      ],
      teams: [{ id: 1n, name: "뉴진스" }],
    });
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    expect(data.teamDistribution.map((row) => row.teamName)).toEqual([
      "뉴진스",
      "미지정",
      "(알 수 없음)",
    ]);
    expect(data.teamDistribution[0].count).toBe(3);
  });

  it("컨디션 null은 unspecified로 집계된다", async () => {
    seed({
      conditionGroups: [
        { condition: "good", _count: { _all: 2 } },
        { condition: null, _count: { _all: 1 } },
      ],
    });
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    const good = data.conditionDistribution.find(
      (row) => row.condition === "good",
    );
    const unspecified = data.conditionDistribution.find(
      (row) => row.condition === "unspecified",
    );
    expect(good?.count).toBe(2);
    expect(unspecified?.count).toBe(1);
  });

  it("썸네일 r2Key가 알림 리스트에 매핑된다", async () => {
    seed({
      outOfStockRows: [{ id: 1n, name: "p", saleStatus: "active" }],
      photos: [{ productId: 1n, r2Key: "products/1/thumb.jpg" }],
    });
    const { getDashboardData } = await import(
      "@/modules/dashboard/lib/queries"
    );
    const data = await getDashboardData();

    expect(data.alerts[0].thumbnailR2Key).toBe("products/1/thumb.jpg");
  });
});
