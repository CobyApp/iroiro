import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverageMatrix as Matrix } from "../lib/coverage-matrix";

type MatrixMember = { id: number; name: string; nameJa?: string | null };

// 커버리지 매트릭스 — 한 그룹의 멤버(행, 표시 순서) × 시리즈(열, 종류별 묶음)에 공개 카드 수.
// 0 은 점선 빈 칸으로 그리고 누르면 그 조합이 미리 채워진 등록 화면으로 간다. 폰에서도 표 그대로 —
// 가로 스크롤에 멤버 열만 고정(sticky)해 어느 행인지 놓치지 않게. 서버 컴포넌트(링크만 있어 상태 불필요).
export function CoverageMatrix({
  teamId,
  matrix,
}: {
  teamId: number;
  matrix: Matrix<MatrixMember>;
}) {
  const flat = matrix.columns.flatMap((g) => g.series);
  if (matrix.rows.length === 0 || flat.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {matrix.rows.length === 0 ? "이 그룹에 멤버가 없어요." : "이 그룹에 시리즈가 없어요."}
      </p>
    );
  }
  const grand = matrix.columnTotals.reduce((a, b) => a + b, 0);
  const stickyCol = "sticky left-0 z-10 bg-card";
  const cellBase =
    "h-11 min-w-[3.25rem] border-b border-l border-border/70 p-0 text-center align-middle sm:h-10";

  return (
    <div className="scroll-x scroll-x-fade overflow-x-auto rounded-md border border-border bg-card shadow-card">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          {/* 1행 — 종류 묶음 */}
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(stickyCol, "min-w-[7.5rem] border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:min-w-[9rem]")}
            >
              멤버
            </th>
            {matrix.columns.map((g) => (
              <th
                key={g.kind}
                scope="colgroup"
                colSpan={g.series.length}
                className="border-b border-l border-border/70 bg-muted/40 px-2 py-1 text-left text-[11px] font-medium text-muted-foreground"
              >
                {g.label}
                <span className="catalog-stat ml-1 text-muted-foreground/70">{g.series.length}</span>
              </th>
            ))}
            <th
              scope="col"
              rowSpan={2}
              className="border-b border-l border-border px-2 py-2 text-right text-xs font-medium text-muted-foreground"
            >
              합계
            </th>
          </tr>
          {/* 2행 — 시리즈 */}
          <tr>
            {flat.map((s) => (
              <th
                key={s.id}
                scope="col"
                title={`${s.label} · ${s.sku}`}
                className="max-w-[7rem] border-b border-l border-border/70 px-1.5 py-1.5 text-center align-bottom text-[11px] font-medium leading-tight text-foreground"
              >
                <Link
                  href={`/admin/catalog/cards?team=${teamId}&series=${s.id}`}
                  className="line-clamp-2 break-keep underline-offset-2 hover:text-primary hover:underline"
                >
                  {s.label}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.member.id} className="group/row">
              <th
                scope="row"
                className={cn(stickyCol, "border-b border-border/70 px-3 py-1.5 text-left font-medium group-hover/row:bg-muted/40")}
              >
                <p className="truncate">{row.member.name}</p>
                {row.member.nameJa && (
                  <p className="truncate text-[11px] font-normal text-muted-foreground">{row.member.nameJa}</p>
                )}
              </th>
              {flat.map((s, i) => {
                const n = row.counts[i];
                return (
                  <td key={s.id} className={cn(cellBase, "group-hover/row:bg-muted/30")}>
                    {n > 0 ? (
                      <Link
                        href={`/admin/catalog/cards?team=${teamId}&member=${row.member.id}&series=${s.id}`}
                        className="catalog-stat grid h-full w-full place-items-center font-semibold text-foreground hover:text-primary"
                        aria-label={`${row.member.name} · ${s.label} 카드 ${n}장 보기`}
                      >
                        {n}
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/catalog/cards/new?team=${teamId}&member=${row.member.id}&series=${s.id}`}
                        className="group/cell grid h-full w-full place-items-center p-1"
                        aria-label={`${row.member.name} · ${s.label} 카드 등록`}
                        title="카드 없음 — 눌러서 등록"
                      >
                        <span className="grid h-7 w-full place-items-center rounded-sm border border-dashed border-border text-muted-foreground/60 transition-colors group-hover/cell:border-primary group-hover/cell:text-primary">
                          <Plus className="h-3 w-3" aria-hidden />
                        </span>
                      </Link>
                    )}
                  </td>
                );
              })}
              <td className="catalog-stat border-b border-l border-border px-2 text-right font-semibold tabular-nums">
                {row.total > 0 ? row.total : <span className="text-muted-foreground">0</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={cn(stickyCol, "px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>
              합계
            </th>
            {matrix.columnTotals.map((n, i) => (
              <td key={flat[i].id} className="catalog-stat border-l border-border/70 px-1 text-center text-xs tabular-nums text-muted-foreground">
                {n}
              </td>
            ))}
            <td className="catalog-stat border-l border-border px-2 text-right text-xs font-semibold tabular-nums">
              {grand}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
