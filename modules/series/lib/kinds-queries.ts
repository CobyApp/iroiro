import "server-only";

import { catalogDb } from "@/lib/catalog-db";
import { SERIES_KIND_LABEL } from "../kinds";

// 시리즈 종류(kind) 레지스트리 — series_kind 테이블이 라벨·순서의 정본.
// 코드 상수(kinds.ts)는 시드·폴백이다: 테이블에 없는 키가 데이터에 있어도 라벨은 나온다.

export type SeriesKind = {
  id: number;
  key: string;
  label: string;
  displayOrder: number;
};

export async function listSeriesKinds(): Promise<SeriesKind[]> {
  const rows = await catalogDb.seriesKind.findMany({
    orderBy: [{ displayOrder: "asc" }, { key: "asc" }],
  });
  return rows.map((r) => ({
    id: Number(r.id),
    key: r.key,
    label: r.label,
    displayOrder: r.displayOrder,
  }));
}

// key → 라벨 맵. DB 라벨 우선, 없으면 코드 상수, 그것도 없으면 키 그대로.
export function buildKindLabelMap(kinds: SeriesKind[]): Record<string, string> {
  const out: Record<string, string> = { ...SERIES_KIND_LABEL };
  for (const k of kinds) out[k.key] = k.label;
  return out;
}

// DB 순서대로 키 정렬 — 목록에 없는 키는 뒤에(알파벳), others/unknown 은 DB 순서와 무관하게 맨 뒤.
export function sortKindKeys(keys: string[], kinds: SeriesKind[]): string[] {
  const rank = new Map(kinds.map((k) => [k.key, k.displayOrder]));
  const rankOf = (key: string) =>
    key === "others" || key === "unknown" ? 1_000_000 : (rank.get(key) ?? 999_999);
  return [...keys].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

// 시리즈에서 실제로 쓰이는 종류별 개수 — 삭제 가능 여부·편집 화면 표시용.
export async function countSeriesByKind(): Promise<Record<string, number>> {
  const rows = await catalogDb.series.groupBy({ by: ["kind"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.kind, r._count._all]));
}
