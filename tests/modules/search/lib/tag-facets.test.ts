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

// groupBy 는 by 인자에 따라 (team, member) / team / itemType|saleMode 를 반환하도록 분기.
// (team, member) 집계는 by 에 teamId·memberId 가 모두 있으므로 memberId 를 먼저 확인.
beforeEach(() => {
  vi.clearAllMocks();
  productGroupBy.mockImplementation(async ({ by }: { by: string[] }) =>
    by.includes("memberId")
      ? [
          { teamId: 1n, memberId: 11n },
          { teamId: 1n, memberId: 12n },
          { teamId: 5n, memberId: 51n },
        ]
      : by.includes("teamId")
        ? [{ teamId: 1n }, { teamId: 5n }]
        : [{ itemType: "photocard" }, { itemType: "sticker" }],
  );
  usedGroupBy.mockImplementation(async ({ by }: { by: string[] }) =>
    by.includes("memberId")
      ? [
          { teamId: 5n, memberId: 51n },
          { teamId: 9n, memberId: 91n },
        ]
      : by.includes("teamId")
        ? [{ teamId: 5n }, { teamId: 9n }]
        : by.includes("itemType")
          ? [{ itemType: "photocard" }, { itemType: "cheki" }]
          : [{ saleMode: "fixed" }],
  );
});

describe("getSearchTagFacets", () => {
  it("스토어·중고의 그룹·종류·판매방식을 number/string 으로 매핑한다", async () => {
    const facets = await getSearchTagFacets();
    expect(facets.storeTeamIds).toEqual([1, 5]);
    expect(facets.storeItemTypes).toEqual(["photocard", "sticker"]);
    expect(facets.usedTeamIds).toEqual([5, 9]);
    expect(facets.usedSaleModes).toEqual(["fixed"]);
    expect(facets.usedItemTypes).toEqual(["photocard", "cheki"]);
  });

  it("그룹→멤버 집계를 teamId 키로 묶어 반환한다(스토어·중고)", async () => {
    const facets = await getSearchTagFacets();
    expect(facets.storeMembersByTeam).toEqual({ "1": [11, 12], "5": [51] });
    expect(facets.usedMembersByTeam).toEqual({ "5": [51], "9": [91] });
  });

  it("멤버 집계는 team·member 가 모두 있는 상품/매물만 센다", async () => {
    await getSearchTagFacets();
    const productMemberCall = productGroupBy.mock.calls.find((c) =>
      c[0].by.includes("memberId"),
    );
    expect(productMemberCall?.[0].where).toMatchObject({
      teamId: { not: null },
      memberId: { not: null },
    });
    const usedMemberCall = usedGroupBy.mock.calls.find((c) =>
      c[0].by.includes("memberId"),
    );
    expect(usedMemberCall?.[0].where).toMatchObject({
      status: "active",
      teamId: { not: null },
      memberId: { not: null },
    });
  });

  it("중고 그룹/판매방식/멤버는 판매중(active)만 집계한다", async () => {
    await getSearchTagFacets();
    for (const call of usedGroupBy.mock.calls) {
      expect(call[0].where.status).toBe("active");
    }
  });

  it("스토어 그룹 태그는 teamId 가 있는 상품만 센다", async () => {
    await getSearchTagFacets();
    const teamCall = productGroupBy.mock.calls.find(
      (c) => c[0].by.includes("teamId") && !c[0].by.includes("memberId"),
    );
    expect(teamCall?.[0].where.teamId).toEqual({ not: null });
  });
});
