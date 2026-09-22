import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listTeams } from "@/modules/teams/lib/queries";
import { listSeriesWithCounts, type SeriesRow } from "@/modules/series/lib/queries";
import { buildKindLabelMap, listSeriesKinds, sortKindKeys } from "@/modules/series/lib/kinds-queries";
import { SeriesCreateButton, SeriesRowActions } from "@/modules/series/components/SeriesManage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export const metadata: Metadata = { title: "시리즈" };

type SearchParams = Promise<{ team?: string }>;

// 시리즈 — 그룹별 섹션으로 나눠 종류 순 → 이름 순으로 나열. 원문(일본어)과 한국어 병기를 함께 보여주고,
// 카드·상품 연결 수로 삭제 가능 여부를 바로 알 수 있다.
export default async function CatalogSeriesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const teamFilter = Number(sp.team) > 0 ? Number(sp.team) : undefined;

  const [teams, rows, kinds] = await Promise.all([
    listTeams(),
    listSeriesWithCounts(),
    listSeriesKinds(),
  ]);
  const kindLabel = buildKindLabelMap(kinds);
  const kindOptions = kinds.map((k) => ({ key: k.key, label: k.label }));

  const sections = teams
    .filter((t) => teamFilter === undefined || t.id === teamFilter)
    .map((team) => ({
      team,
      series: sortByKind(rows.filter((s) => s.teamId === team.id)),
    }));
  const orphan = teamFilter === undefined ? sortByKind(rows.filter((s) => s.teamId === null)) : [];

  function sortByKind(list: SeriesRow[]): SeriesRow[] {
    const order = sortKindKeys([...new Set(list.map((s) => s.kind))], kinds);
    const rank = new Map(order.map((k, i) => [k, i]));
    return [...list].sort(
      (a, b) => (rank.get(a.kind) ?? 0) - (rank.get(b.kind) ?? 0) || a.label.localeCompare(b.label, "ja"),
    );
  }

  const chip = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="SERIES"
        title="시리즈"
        count={rows.length}
        description={
          <>
            카드가 속하는 발매 단위. 원문이 일본어면 한국어 병기를 넣어두면 고객 화면에 함께 표기돼요. 종류는{" "}
            <Link href="/catalog/kinds" className="text-primary underline-offset-2 hover:underline">
              종류 관리
            </Link>
            에서 편집합니다.
          </>
        }
      />

      <div className="scroll-x scroll-x-fade flex gap-1.5 overflow-x-auto pb-1">
        <Link href="/catalog/series" className={chip(teamFilter === undefined)}>
          모든 그룹
        </Link>
        {teams.map((t) => (
          <Link key={t.id} href={`/catalog/series?team=${t.id}`} className={chip(teamFilter === t.id)}>
            {t.name}
            <span className="ml-1 tabular-nums text-muted-foreground">
              {rows.filter((s) => s.teamId === t.id).length}
            </span>
          </Link>
        ))}
      </div>

      {sections.map(({ team, series }) => (
        <section
          key={team.id}
          className="team-bar overflow-hidden rounded-md border border-border bg-card"
          style={{ ["--team-color" as string]: team.themeColor ?? undefined }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="font-display text-lg">{team.name}</h2>
              {team.nameI18n?.["ja-jpan"] && (
                <span className="text-xs text-muted-foreground">{team.nameI18n["ja-jpan"]}</span>
              )}
              <span className="catalog-stat text-xs text-muted-foreground">시리즈 {series.length}</span>
            </div>
            <SeriesCreateButton teamId={team.id} kinds={kindOptions} />
          </div>
          {series.length === 0 ? (
            <p className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
              아직 시리즈가 없어요.
            </p>
          ) : (
            <SeriesTable series={series} kindLabel={kindLabel} kindOptions={kindOptions} />
          )}
        </section>
      ))}

      {orphan.length > 0 && (
        <section className="overflow-hidden rounded-md border border-dashed border-border bg-card">
          <div className="px-4 py-3 sm:px-5 sm:py-3.5">
            <h2 className="font-display text-lg">그룹 미지정</h2>
            <p className="text-xs text-muted-foreground">
              그룹이 비어 있는 시리즈 — 수정에서 그룹을 지정할 수 없으니 확인 후 정리해주세요.
            </p>
          </div>
          <SeriesTable series={orphan} kindLabel={kindLabel} kindOptions={kindOptions} />
        </section>
      )}
    </div>
  );
}

// 섹션 카드 안에 들어가므로 Table 프리미티브의 자체 테두리·모서리·그림자는 지우고 위쪽 구분선만 남긴다(이중 테두리 방지).
// SKU·상품 열은 폰에서 숨기고 SKU 는 시리즈 이름 아래에 붙인다.
function SeriesTable({
  series,
  kindLabel,
  kindOptions,
}: {
  series: SeriesRow[];
  kindLabel: Record<string, string>;
  kindOptions: { key: string; label: string }[];
}) {
  return (
    <div className="border-t border-border [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>종류</TableHead>
          <TableHead>시리즈</TableHead>
          <TableHead className="hidden md:table-cell">SKU</TableHead>
          <TableHead className="text-right">카드</TableHead>
          <TableHead className="hidden text-right md:table-cell">상품</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">관리</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {series.map((s) => (
          <TableRow key={s.id}>
            <TableCell>
              <Badge variant="outline" className="whitespace-nowrap font-normal">
                {kindLabel[s.kind] ?? s.kind}
              </Badge>
            </TableCell>
            <TableCell>
              <p className="font-medium text-foreground">{s.label}</p>
              {s.labelKo ? (
                <p className="text-xs text-muted-foreground">{s.labelKo}</p>
              ) : (
                /[぀-ヿ一-鿿]/.test(s.label) && (
                  <p className="text-[11px] font-medium text-primary">한국어 병기 없음</p>
                )
              )}
              <p className="catalog-mono break-all text-muted-foreground md:hidden">{s.sku}</p>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <p className="catalog-mono text-muted-foreground">{s.sku}</p>
              {s.productUrl && (
                <a
                  href={s.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block max-w-[14rem] truncate text-[11px] text-primary underline-offset-2 hover:underline"
                >
                  {s.productUrl.replace(/^https?:\/\//, "")}
                </a>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {s.cardCount > 0 ? (
                <Link
                  href={`/catalog/cards?series=${s.id}${s.teamId ? `&team=${s.teamId}` : ""}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {s.cardCount.toLocaleString()}
                </Link>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">
              {s.productCount > 0 ? (
                s.productCount.toLocaleString()
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TableCell>
            <TableCell>
              <SeriesRowActions
                series={{
                  id: s.id,
                  sku: s.sku,
                  label: s.label,
                  labelKo: s.labelKo,
                  kind: s.kind,
                  teamId: s.teamId,
                  productUrl: s.productUrl,
                }}
                linkedCount={s.cardCount + s.productCount}
                kinds={kindOptions}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
