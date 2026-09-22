import { describe, expect, it } from "vitest";
import {
  buildListingFacets,
  pickSaleModesWithListings,
  pickWithListings,
} from "@/modules/products/lib/facets";

describe("buildListingFacets", () => {
  it("groupBy 행을 그룹·그룹별 멤버·판매방식 count 로 접는다 (BigInt id 는 문자열 키)", () => {
    const facets = buildListingFacets(
      [
        { teamId: 1n, memberId: 10n, saleMode: "fixed", count: 3 },
        { teamId: 1n, memberId: 11n, saleMode: "auction", count: 1 },
        { teamId: 2n, memberId: 20n, saleMode: "fixed", count: 2 },
        { teamId: 1n, memberId: 10n, saleMode: "auction", count: 2 },
      ],
      4,
    );

    expect(facets.teams).toEqual({ "1": 6, "2": 2 });
    expect(facets.membersByTeam).toEqual({
      "1": { "10": 5, "11": 1 },
      "2": { "20": 2 },
    });
    expect(facets.saleModes).toEqual({ fixed: 5, auction: 3 });
    expect(facets.inStock).toBe(4);
  });

  it("teamId 가 null 인 매물은 판매방식에만 집계하고, memberId 가 null 이면 멤버 집계에서 제외한다", () => {
    const facets = buildListingFacets([
      { teamId: null, memberId: null, saleMode: "fixed", count: 2 },
      { teamId: 3, memberId: null, saleMode: "fixed", count: 1 },
    ]);

    expect(facets.teams).toEqual({ "3": 1 });
    expect(facets.membersByTeam).toEqual({});
    expect(facets.saleModes).toEqual({ fixed: 3 });
  });

  it("inStock 을 생략하면 전체 매물 수를 쓴다(중고 매물처럼 재고 개념이 없는 경우)", () => {
    const facets = buildListingFacets([
      { teamId: 1, memberId: 1, saleMode: "fixed", count: 2 },
      { teamId: 2, memberId: 2, saleMode: "auction", count: 5 },
    ]);
    expect(facets.inStock).toBe(7);
  });

  it("count 0 이하 행은 무시한다", () => {
    const facets = buildListingFacets([
      { teamId: 1, memberId: 1, saleMode: "fixed", count: 0 },
    ]);
    expect(facets.teams).toEqual({});
    expect(facets.saleModes).toEqual({});
    expect(facets.inStock).toBe(0);
  });
});

describe("pickWithListings", () => {
  const teams = [
    { id: 1, name: "A" },
    { id: 2, name: "B" },
    { id: 3, name: "C" },
  ];

  it("count > 0 인 항목만 남기고 마스터 순서를 유지한다", () => {
    expect(pickWithListings(teams, { "3": 2, "1": 1 })).toEqual([
      { id: 1, name: "A" },
      { id: 3, name: "C" },
    ]);
  });

  it("선택된 값은 매물이 0이어도 남긴다 (공유 URL 에서 해제 가능해야 함)", () => {
    expect(pickWithListings(teams, { "1": 1 }, 2)).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });

  it("counts 가 undefined(그 그룹에 매물 없음)면 선택된 값만 남는다", () => {
    expect(pickWithListings(teams, undefined)).toEqual([]);
    expect(pickWithListings(teams, undefined, 3)).toEqual([{ id: 3, name: "C" }]);
  });
});

describe("pickSaleModesWithListings", () => {
  it.each([
    [{ fixed: 3 }, undefined, ["fixed"]],
    [{ fixed: 3, auction: 1 }, undefined, ["fixed", "auction"]],
    [{}, undefined, []],
    [{ fixed: 3 }, "auction", ["fixed", "auction"]],
  ] as const)("counts=%j selected=%s → %j", (counts, selected, expected) => {
    expect(
      pickSaleModesWithListings(["fixed", "auction"] as const, counts, selected),
    ).toEqual(expected);
  });
});
