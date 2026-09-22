import { beforeEach, describe, expect, it, vi } from "vitest";

const usedFindMany = vi.fn();
const usedCount = vi.fn();
const usedGroupBy = vi.fn();
const photoFindMany = vi.fn();
const accountFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    usedListing: {
      findMany: usedFindMany,
      count: usedCount,
      groupBy: usedGroupBy,
    },
    usedListingPhoto: { findMany: photoFindMany },
    account: { findMany: accountFindMany },
  },
}));

beforeEach(() => {
  vi.resetModules();
  usedFindMany.mockReset().mockResolvedValue([]);
  usedCount.mockReset().mockResolvedValue(0);
  usedGroupBy.mockReset().mockResolvedValue([]);
  photoFindMany.mockReset().mockResolvedValue([]);
  accountFindMany.mockReset().mockResolvedValue([]);
});

// 중고 홈 필터 칩 facet — 목록(listUsedListings)과 같은 노출 규칙을 공유해야 한다.
describe("listUsedListingFacets", () => {
  it("판매중·거래중(active·reserved) 매물만 team·member·saleMode 로 groupBy 한다", async () => {
    const { listUsedListingFacets } = await import("@/modules/used/lib/queries");
    await listUsedListingFacets();

    const args = usedGroupBy.mock.calls[0][0];
    expect(args.by).toEqual(["teamId", "memberId", "saleMode"]);
    expect(args.where).toEqual({ status: { in: ["active", "reserved"] } });
  });

  it("facet 의 status 조건은 listUsedListings 목록 조회와 동일하다", async () => {
    const { listUsedListingFacets, listUsedListings } = await import(
      "@/modules/used/lib/queries"
    );
    await listUsedListingFacets();
    await listUsedListings();

    expect(usedGroupBy.mock.calls[0][0].where.status).toEqual(
      usedFindMany.mock.calls[0][0].where.status,
    );
  });

  it("groupBy 결과를 ListingFacets 로 매핑하고 inStock 은 전체 매물 수로 둔다", async () => {
    usedGroupBy.mockResolvedValue([
      { teamId: 2n, memberId: 20n, saleMode: "fixed", _count: { _all: 3 } },
      { teamId: 2n, memberId: 21n, saleMode: "auction", _count: { _all: 1 } },
      { teamId: 5n, memberId: null, saleMode: "fixed", _count: { _all: 2 } },
    ]);
    const { listUsedListingFacets } = await import("@/modules/used/lib/queries");

    const facets = await listUsedListingFacets();

    expect(facets).toEqual({
      teams: { "2": 4, "5": 2 },
      membersByTeam: { "2": { "20": 3, "21": 1 } },
      saleModes: { fixed: 5, auction: 1 },
      inStock: 6,
    });
  });

  it("노출 매물이 없으면 빈 facet 을 돌려준다", async () => {
    const { listUsedListingFacets } = await import("@/modules/used/lib/queries");
    expect(await listUsedListingFacets()).toEqual({
      teams: {},
      membersByTeam: {},
      saleModes: {},
      inStock: 0,
    });
  });
});
