import "server-only";

import { catalogDb } from "@/lib/catalog-db";
import { buildKindLabelMap, sortKindKeys, type KindOption } from "./kind-options";

// 시리즈 종류(kind) 레지스트리 — series_kind 테이블이 라벨·순서의 정본.
// 코드 상수(kinds.ts)는 시드·폴백이다: 테이블에 없는 키가 데이터에 있어도 라벨은 나온다.
// 순수 헬퍼(라벨 맵·정렬)는 클라이언트 폼도 쓰므로 kind-options.ts 에 두고 여기서 재노출한다.

export type SeriesKind = KindOption & { id: number };

export { buildKindLabelMap, sortKindKeys };

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

// 시리즈에서 실제로 쓰이는 종류별 개수 — 삭제 가능 여부·편집 화면 표시용.
export async function countSeriesByKind(): Promise<Record<string, number>> {
  const rows = await catalogDb.series.groupBy({ by: ["kind"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.kind, r._count._all]));
}
