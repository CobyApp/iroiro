import { beforeEach, describe, expect, it, vi } from "vitest";

const { productGroupBy, usedGroupBy } = vi.hoisted(() => ({
  productGroupBy: vi.fn(),
  usedGroupBy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    product: { groupBy: productGroupBy },
    usedListing: { groupBy: usedGroupBy },
  },
}));

import { getSearchTagFacets } from "@/modules/search/lib/tag-facets";

// groupBy 는 by 인자에 따라 teams / itemType|saleMode 를 반환하도록 분기.
beforeEach(() => {
  vi.clearAllMocks();
  productGroupBy.mockImplementation(async ({ by }: { by: string[] }) =>
    by.includes("teamId")
      ? [{ teamId: 1n }, { teamId: 5n }]
      : [{ itemType: "photocard" }, { itemType: "sticker" }],
  );
  usedGroupBy.mockImplementation(async ({ by }: { by: string[] }) =>
    by.includes("teamId") ? [{ teamId: 5n }, { teamId: 9n }] : [{ saleMode: "fixed" }],
  );
});

describe("getSearchTagFacets", () => {
  it("스토어·중고의 그룹·종류·판매방식을 number/string 으로 매핑한다", async () => {
    const facets = await getSearchTagFacets();
    expect(facets.storeTeamIds).toEqual([1, 5]);
    expect(facets.storeItemTypes).toEqual(["photocard", "sticker"]);
    expect(facets.usedTeamIds).toEqual([5, 9]);
    expect(facets.usedSaleModes).toEqual(["fixed"]);
  });

  it("중고 그룹/판매방식은 판매중(active)만 집계한다", async () => {
    await getSearchTagFacets();
    for (const call of usedGroupBy.mock.calls) {
      expect(call[0].where.status).toBe("active");
    }
  });

  it("스토어 그룹 태그는 teamId 가 있는 상품만 센다", async () => {
    await getSearchTagFacets();
    const teamCall = productGroupBy.mock.calls.find((c) => c[0].by.includes("teamId"));
    expect(teamCall?.[0].where.teamId).toEqual({ not: null });
  });
});
