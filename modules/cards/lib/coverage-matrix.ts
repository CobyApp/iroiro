import { kindLabelOf, sortKindKeys, type KindOption } from "@/modules/series/lib/kind-options";

// 커버리지 매트릭스의 순수 계산 — 서버 컴포넌트·테스트 양쪽에서 쓴다(DB 접근 없음).
// 행 = 그룹 멤버(표시 순서), 열 = 그룹 시리즈(종류별 묶음), 셀 = 공개 카드 수.

export type CoverageCell = { memberId: number; seriesId: number; count: number };

export type CoverageSeries = { id: number; label: string; kind: string; sku: string };

export type CoverageColumnGroup = {
  kind: string;
  label: string;
  series: CoverageSeries[];
};

export type CoverageRow<M extends { id: number }> = {
  member: M;
  /** 시리즈 id 순서는 columns 를 평탄화한 순서와 같다. */
  counts: number[];
  total: number;
};

export type CoverageMatrix<M extends { id: number }> = {
  columns: CoverageColumnGroup[];
  rows: CoverageRow<M>[];
  /** 시리즈별 합계 — columns 평탄화 순서. */
  columnTotals: number[];
  /** 카드가 0장인 (멤버, 시리즈) 조합 수. */
  emptyCells: number;
};

export function coverageKey(memberId: number, seriesId: number): string {
  return `${memberId}:${seriesId}`;
}

// 시리즈를 종류(DB 순서)별로 묶고, 묶음 안에서는 라벨순.
export function groupSeriesByKind(
  series: CoverageSeries[],
  kinds: KindOption[],
): CoverageColumnGroup[] {
  const kindKeys = sortKindKeys([...new Set(series.map((s) => s.kind))], kinds);
  return kindKeys.map((kind) => ({
    kind,
    label: kindLabelOf(kinds, kind),
    series: series
      .filter((s) => s.kind === kind)
      .sort((a, b) => a.label.localeCompare(b.label, "ja")),
  }));
}

export function buildCoverageMatrix<M extends { id: number }>(
  members: M[],
  columns: CoverageColumnGroup[],
  cells: CoverageCell[],
): CoverageMatrix<M> {
  const lookup = new Map(cells.map((c) => [coverageKey(c.memberId, c.seriesId), c.count]));
  const flat = columns.flatMap((g) => g.series);
  const columnTotals = flat.map(() => 0);
  let emptyCells = 0;
  const rows = members.map((member) => {
    const counts = flat.map((s, i) => {
      const n = lookup.get(coverageKey(member.id, s.id)) ?? 0;
      columnTotals[i] += n;
      if (n === 0) emptyCells += 1;
      return n;
    });
    return { member, counts, total: counts.reduce((a, b) => a + b, 0) };
  });
  return { columns, rows, columnTotals, emptyCells };
}
