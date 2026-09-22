import "server-only";
import { db } from "@/lib/db";

// 고객 검색 포커스 패널의 필터 태그(그룹·종류·판매방식) 중 "실제로 결과가 있는" 값만 노출하기 위한 facet.
// 상품/매물이 하나도 없는 태그는 눌러도 빈 화면이라 감춘다.
// 스토어·중고 각각 집계 — 홈 헤더(모든 shop 페이지)에서 한 번 로드해 HeaderLeading 으로 넘긴다.

export type SearchTagFacets = {
  /** 스토어: 상품이 있는 그룹(team) id */
  storeTeamIds: number[];
  /** 스토어: 상품이 있는 아이템 종류 */
  storeItemTypes: string[];
  /** 스토어: 그룹(teamId) → 상품이 있는 멤버(member) id 목록. 그룹 선택 후 멤버 칩에 사용. */
  storeMembersByTeam: Record<string, number[]>;
  /** 중고: 판매중 매물이 있는 그룹(team) id */
  usedTeamIds: number[];
  /** 중고: 판매중 매물이 있는 판매 방식(fixed·auction) */
  usedSaleModes: string[];
  /** 중고: 판매중 매물이 있는 굿즈 종류(item_type) */
  usedItemTypes: string[];
  /** 중고: 그룹(teamId) → 판매중 매물이 있는 멤버(member) id 목록. */
  usedMembersByTeam: Record<string, number[]>;
};

export const EMPTY_SEARCH_TAG_FACETS: SearchTagFacets = {
  storeTeamIds: [],
  storeItemTypes: [],
  storeMembersByTeam: {},
  usedTeamIds: [],
  usedSaleModes: [],
  usedItemTypes: [],
  usedMembersByTeam: {},
};

/** groupBy(teamId, memberId) 행을 teamId → memberId[] 로 접는다(둘 다 null 아닌 것만). */
function foldMembersByTeam(
  rows: { teamId: bigint | number | null; memberId: bigint | number | null }[],
): Record<string, number[]> {
  const byTeam: Record<string, number[]> = {};
  for (const row of rows) {
    if (row.teamId === null || row.memberId === null) continue;
    const teamKey = String(row.teamId);
    (byTeam[teamKey] ??= []).push(Number(row.memberId));
  }
  return byTeam;
}

export async function getSearchTagFacets(): Promise<SearchTagFacets> {
  const [
    storeTeams,
    storeTypes,
    storeMembers,
    usedTeams,
    usedModes,
    usedTypes,
    usedMembers,
  ] = await Promise.all([
    // 스토어 상품은 존재 자체를 기준으로(팀 태그는 /products?team= 로 이동 — 상태 무관 노출).
    db.product.groupBy({
      by: ["teamId"],
      where: { teamId: { not: null } },
      _count: { _all: true },
    }),
    db.product.groupBy({ by: ["itemType"], _count: { _all: true } }),
    // 그룹→멤버 칩: 그룹·멤버가 모두 지정된 상품이 있는 (팀, 멤버) 쌍만.
    db.product.groupBy({
      by: ["teamId", "memberId"],
      where: { teamId: { not: null }, memberId: { not: null } },
      _count: { _all: true },
    }),
    // 중고는 판매중(active) 매물만 — 차단·판매완료·취소는 검색 태그에서 제외.
    db.usedListing.groupBy({
      by: ["teamId"],
      where: { status: "active", teamId: { not: null } },
      _count: { _all: true },
    }),
    db.usedListing.groupBy({
      by: ["saleMode"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    db.usedListing.groupBy({
      by: ["itemType"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    db.usedListing.groupBy({
      by: ["teamId", "memberId"],
      where: { status: "active", teamId: { not: null }, memberId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  return {
    storeTeamIds: storeTeams.map((r) => Number(r.teamId)),
    storeItemTypes: storeTypes.map((r) => r.itemType),
    storeMembersByTeam: foldMembersByTeam(storeMembers),
    usedTeamIds: usedTeams.map((r) => Number(r.teamId)),
    usedSaleModes: usedModes.map((r) => r.saleMode),
    usedItemTypes: usedTypes.map((r) => r.itemType),
    usedMembersByTeam: foldMembersByTeam(usedMembers),
  };
}
