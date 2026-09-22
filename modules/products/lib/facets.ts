import type { SaleMode } from "../types";

/**
 * 고객 화면 필터 칩용 매물 facet.
 *
 * 카탈로그 마스터(전 그룹·전 멤버)가 아니라 "지금 노출 중인 매물"을 집계한 값이라,
 * 칩은 여기서 count > 0 인 값만 보여준다(빈 결과로 이어지는 태그 제거).
 * 서버 → 클라이언트 컴포넌트로 그대로 넘기므로 Map/Set 대신 plain object 를 쓴다.
 */
export type ListingFacets = {
  /** teamId → 매물 수 */
  teams: Record<string, number>;
  /** teamId → (memberId → 매물 수). 그룹 선택 후 멤버 칩에 사용. */
  membersByTeam: Record<string, Record<string, number>>;
  /** saleMode → 매물 수 */
  saleModes: Partial<Record<SaleMode, number>>;
  /** 재고 있는(구매 가능한) 매물 수 — 재고있음 토글 노출 여부 */
  inStock: number;
};

/** groupBy(teamId, memberId, saleMode) 결과 한 행 */
export type ListingFacetRow = {
  teamId: bigint | number | null;
  memberId: bigint | number | null;
  saleMode: string;
  count: number;
};

export const EMPTY_LISTING_FACETS: ListingFacets = {
  teams: {},
  membersByTeam: {},
  saleModes: {},
  inStock: 0,
};

function bump(target: Record<string, number>, key: string, by: number) {
  target[key] = (target[key] ?? 0) + by;
}

/**
 * groupBy 행을 facet 으로 접는다.
 * `inStock` 을 생략하면 모든 매물이 구매 가능하다고 보고 전체 합계를 쓴다(중고 매물 등).
 */
export function buildListingFacets(
  rows: ListingFacetRow[],
  inStock?: number,
): ListingFacets {
  const facets: ListingFacets = {
    teams: {},
    membersByTeam: {},
    saleModes: {},
    inStock: 0,
  };
  let total = 0;
  for (const row of rows) {
    if (row.count <= 0) continue;
    total += row.count;
    bump(facets.saleModes as Record<string, number>, row.saleMode, row.count);
    if (row.teamId === null) continue;
    const teamKey = String(row.teamId);
    bump(facets.teams, teamKey, row.count);
    if (row.memberId === null) continue;
    const members = (facets.membersByTeam[teamKey] ??= {});
    bump(members, String(row.memberId), row.count);
  }
  facets.inStock = inStock ?? total;
  return facets;
}

/**
 * 마스터 목록 중 매물이 있는 항목만 남긴다.
 * 현재 선택된 값(공유 URL 등)은 결과가 0이어도 남겨서 사용자가 해제할 수 있게 한다.
 */
export function pickWithListings<T extends { id: number }>(
  items: T[],
  counts: Record<string, number> | undefined,
  selectedId?: number,
): T[] {
  return items.filter(
    (item) => item.id === selectedId || (counts?.[String(item.id)] ?? 0) > 0,
  );
}

/** 판매 방식 값 중 매물이 있는 것만(선택된 값은 유지). */
export function pickSaleModesWithListings<M extends string>(
  modes: readonly M[],
  counts: Partial<Record<M, number>>,
  selected?: M,
): M[] {
  return modes.filter((mode) => mode === selected || (counts[mode] ?? 0) > 0);
}
