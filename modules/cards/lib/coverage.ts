import "server-only";

import { catalogDb } from "@/lib/catalog-db";
import { groupSeriesByKind, type CoverageCell, type CoverageSeries } from "./coverage-matrix";

export type { CoverageCell, CoverageSeries } from "./coverage-matrix";
export { buildCoverageMatrix, coverageKey, groupSeriesByKind } from "./coverage-matrix";

// 커버리지 매트릭스 데이터 — 한 그룹의 (멤버 × 시리즈) 공개 카드 수.
// 멤버·시리즈가 비어 있는 카드(그룹 굿즈 등)는 매트릭스 셀이 없으므로 제외한다.
export async function listActiveCardCoverage(teamId: number): Promise<CoverageCell[]> {
  const rows = await catalogDb.card.groupBy({
    by: ["memberId", "seriesId"],
    where: { teamId: BigInt(teamId), status: "active" },
    _count: { _all: true },
  });
  const out: CoverageCell[] = [];
  for (const r of rows) {
    if (r.memberId === null || r.seriesId === null) continue;
    out.push({
      memberId: Number(r.memberId),
      seriesId: Number(r.seriesId),
      count: r._count._all,
    });
  }
  return out;
}

// 매트릭스 열(시리즈) — 그룹의 시리즈를 SKU 포함 가볍게. 정렬(종류 → 라벨)은 groupSeriesByKind 가 맡는다.
export async function listCoverageSeries(teamId: number): Promise<CoverageSeries[]> {
  const rows = await catalogDb.series.findMany({
    where: { teamId: BigInt(teamId) },
    select: { id: true, label: true, kind: true, sku: true },
    orderBy: { label: "asc" },
  });
  return rows.map((s) => ({ id: Number(s.id), label: s.label, kind: s.kind, sku: s.sku }));
}

// 서버 컴포넌트가 한 번에 쓰기 위한 묶음 — 셀 + 종류별 열.
export async function getTeamCoverage(
  teamId: number,
  kinds: { key: string; label: string; displayOrder: number }[],
) {
  const [cells, series] = await Promise.all([
    listActiveCardCoverage(teamId),
    listCoverageSeries(teamId),
  ]);
  return { cells, columns: groupSeriesByKind(series, kinds) };
}
