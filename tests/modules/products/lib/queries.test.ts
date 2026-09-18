import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindMany = vi.fn();
const productCount = vi.fn();
const photoFindMany = vi.fn();
const teamFindMany = vi.fn();
const memberFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: { findMany: productFindMany, count: productCount },
    productPhoto: { findMany: photoFindMany },
    team: { findMany: teamFindMany },
    member: { findMany: memberFindMany },
  },
}));

beforeEach(() => {
  vi.resetModules();
  productFindMany.mockReset().mockResolvedValue([]);
  productCount.mockReset().mockResolvedValue(0);
  photoFindMany.mockReset().mockResolvedValue([]);
  teamFindMany.mockReset().mockResolvedValue([]);
  memberFindMany.mockReset().mockResolvedValue([]);
});

// 필터·정렬·페이지네이션은 Prisma로 위임되므로 where/orderBy/skip/take 인자를 검증한다.
describe("listProducts", () => {
  it("teamId 필터를 BigInt where로 전달한다", async () => {
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({ teamId: 1, sort: "newest", page: 1, pageSize: 24 });

    expect(productFindMany.mock.calls[0][0].where.teamId).toBe(1n);
  });

  it("stock=in_stock 필터는 stockQuantity > 0 조건이 된다", async () => {
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({ stock: "in_stock", sort: "newest", page: 1, pageSize: 24 });

    expect(productFindMany.mock.calls[0][0].where.stockQuantity).toEqual({
      gt: 0,
    });
  });

  it("stock=out_of_stock 필터는 stockQuantity = 0 조건이 된다", async () => {
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({
      stock: "out_of_stock",
      sort: "newest",
      page: 1,
      pageSize: 24,
    });

    expect(productFindMany.mock.calls[0][0].where.stockQuantity).toBe(0);
  });

  it("price_asc 정렬은 salePrice 오름차순 orderBy가 된다", async () => {
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({ sort: "price_asc", page: 1, pageSize: 24 });

    expect(productFindMany.mock.calls[0][0].orderBy).toEqual({
      salePrice: "asc",
    });
  });

  it("saleStatus='active' 필터가 where에 반영된다", async () => {
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({ saleStatus: "active", sort: "newest", page: 1, pageSize: 100 });

    expect(productFindMany.mock.calls[0][0].where.saleStatus).toBe("active");
  });

  it("saleStatus 미지정 시 where에 saleStatus 조건이 없다 (어드민 케이스)", async () => {
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({ sort: "newest", page: 1, pageSize: 100 });

    expect(productFindMany.mock.calls[0][0].where).not.toHaveProperty(
      "saleStatus",
    );
  });

  it("페이지네이션이 skip/take와 count 기반 total을 반영한다", async () => {
    productCount.mockResolvedValue(30);
    const { listProducts } = await import("@/modules/products/lib/queries");
    const result = await listProducts({ sort: "newest", page: 2, pageSize: 24 });

    expect(productFindMany.mock.calls[0][0].skip).toBe(24);
    expect(productFindMany.mock.calls[0][0].take).toBe(24);
    expect(result.total).toBe(30);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(24);
  });

  it("q 검색은 team/member 이름 매칭 ID를 OR 조건으로 확장한다", async () => {
    teamFindMany.mockResolvedValue([{ id: 7n }]);
    memberFindMany.mockResolvedValue([{ id: 9n }]);
    const { listProducts } = await import("@/modules/products/lib/queries");
    await listProducts({ q: "뉴진스", sort: "newest", page: 1, pageSize: 24 });

    const or = productFindMany.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ teamId: { in: [7n] } });
    expect(or).toContainEqual({ memberId: { in: [9n] } });
    expect(or).toContainEqual({
      name: { contains: "뉴진스", mode: "insensitive" },
    });
  });
});

describe("listSiblingListings", () => {
  it("source_id가 있으면 그것을 카드 키로 쓰고 자기 자신을 제외한다", async () => {
    const { listSiblingListings } = await import(
      "@/modules/products/lib/queries"
    );
    await listSiblingListings({ id: 10, sourceId: "77", itemCode: "CS-1" });

    const where = productFindMany.mock.calls[0][0].where;
    expect(where.sourceId).toBe("77");
    expect(where.id).toEqual({ not: 10n });
    expect(where.saleStatus).toBe("active");
  });

  it("source_id가 없으면 item_code로 폴백한다", async () => {
    const { listSiblingListings } = await import(
      "@/modules/products/lib/queries"
    );
    await listSiblingListings({ id: 10, sourceId: null, itemCode: "CS-1" });

    expect(productFindMany.mock.calls[0][0].where.itemCode).toBe("CS-1");
  });

  it("카드 키가 전혀 없으면 조회 없이 빈 배열", async () => {
    const { listSiblingListings } = await import(
      "@/modules/products/lib/queries"
    );
    const rows = await listSiblingListings({
      id: 10,
      sourceId: null,
      itemCode: null,
    });

    expect(rows).toEqual([]);
    expect(productFindMany).not.toHaveBeenCalled();
  });
});

describe("listRelatedProducts", () => {
  const base = {
    id: 10,
    sourceId: "77",
    itemCode: null,
    memberId: 3,
    seriesId: 5,
    teamId: 1,
  };

  it("멤버 → 시리즈 → 그룹 순으로 티어를 조회한다", async () => {
    const { listRelatedProducts } = await import(
      "@/modules/products/lib/queries"
    );
    await listRelatedProducts(base, 8);

    expect(productFindMany).toHaveBeenCalledTimes(3);
    expect(productFindMany.mock.calls[0][0].where.memberId).toBe(3n);
    expect(productFindMany.mock.calls[1][0].where.seriesId).toBe(5n);
    expect(productFindMany.mock.calls[2][0].where.teamId).toBe(1n);
  });

  it("같은 카드(source_id) 매물은 추천에서 제외한다", async () => {
    const { listRelatedProducts } = await import(
      "@/modules/products/lib/queries"
    );
    await listRelatedProducts(base, 8);

    expect(productFindMany.mock.calls[0][0].where.NOT).toEqual({
      sourceId: "77",
    });
  });

  it("limit을 채우면 다음 티어는 조회하지 않는다", async () => {
    const row = (id: bigint) => ({
      id,
      itemCode: null,
      sourceId: null,
      itemType: "photocard",
      teamId: null,
      memberId: null,
      name: "관련",
      description: null,
      purchasePriceJpy: 0,
      purchaseExchangeRate: 1,
      purchasePriceKrw: 0,
      packagingCostKrw: 0,
      overseasShippingKrw: 0,
      domesticShippingKrw: 0,
      otherCostKrw: 0,
      purchaser: null,
      purchaseDate: new Date("2026-08-01"),
      regularPrice: 1000,
      salePrice: 1000,
      condition: null,
      stockQuantity: 1,
      saleStatus: "active",
      saleMode: "fixed",
      seriesId: null,
      marketAvgJpy: 0,
      marketMinJpy: 0,
      marketMaxJpy: 0,
      marketSoldCount: 0,
      retailPriceJpy: 0,
      auctionStartPrice: null,
      auctionCurrentPrice: null,
      auctionBidCount: 0,
      auctionEndsAt: null,
      auctionStatus: null,
      auctionWinnerAccountId: null,
      auctionPayDueAt: null,
      createdAt: new Date("2026-08-01"),
      createdBy: null,
      updatedAt: new Date("2026-08-01"),
      updatedBy: null,
    });
    productFindMany.mockResolvedValueOnce([row(21n), row(22n)]);

    const { listRelatedProducts } = await import(
      "@/modules/products/lib/queries"
    );
    const rows = await listRelatedProducts(base, 2);

    expect(productFindMany).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.id)).toEqual([21, 22]);
  });
});
