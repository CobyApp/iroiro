import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Sparkles, User, Users } from "lucide-react";
import { db } from "@/lib/db";
import { formatKstDateTime } from "@/lib/datetime";
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
import { listMembers } from "@/modules/members/lib/queries";
import { getCardAnalysisSummary } from "@/modules/cards/lib/queries";
import {
  SeriesCreateButton,
  SeriesRowActions,
} from "@/modules/series/components/SeriesManage";
import { seriesKindLabel } from "@/modules/series/kinds";

export const metadata: Metadata = { title: "카탈로그" };


// 카탈로그 홈 — 토레카 마스터 데이터(그룹 → 멤버 → 시리즈)와 AI 분석 현황을 한 화면에서.
export default async function CatalogHomePage() {
  const [
    teams,
    members,
    seriesRows,
    bySeries,
    byMember,
    byTeam,
    totalProducts,
    ai,
  ] = await Promise.all([
      listTeams(),
      listMembers(),
      db.series.findMany({ orderBy: [{ kind: "asc" }, { label: "asc" }] }),
      db.product.groupBy({
        by: ["seriesId"],
        _count: { _all: true },
        _avg: { marketAvgJpy: true },
      }),
      db.product.groupBy({ by: ["memberId"], _count: { _all: true } }),
      db.product.groupBy({ by: ["teamId"], _count: { _all: true } }),
      db.product.count(),
      getCardAnalysisSummary(),
    ]);

  const countBySeries = new Map(
    bySeries.map((r) => [
      r.seriesId === null ? null : Number(r.seriesId),
      { count: r._count._all, avgJpy: Math.round(r._avg.marketAvgJpy ?? 0) },
    ]),
  );
  const countByMember = new Map(
    byMember.map((r) => [
      r.memberId === null ? null : Number(r.memberId),
      r._count._all,
    ]),
  );
  const countByTeam = new Map(
    byTeam.map((r) => [
      r.teamId === null ? null : Number(r.teamId),
      r._count._all,
    ]),
  );
  const noSeriesCount = countBySeries.get(null)?.count ?? 0;

  const stats = [
    { label: "토레카", value: ai.total, href: "/catalog/cards" },
    { label: "그룹", value: teams.length, href: "/catalog/teams" },
    { label: "멤버", value: members.length, href: "/catalog/members" },
    { label: "시리즈", value: seriesRows.length, href: null },
    // 상품은 운영 관리자 소관 — 카탈로그에서는 분포만 보고 링크로 넘긴다.
    { label: "상품", value: totalProducts, href: "/admin/products" },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">카탈로그 홈</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          토레카 마스터 데이터 — 그룹 → 멤버 → 시리즈 계층, 상품 분포, AI 분석 현황을
          한눈에. 데이터는 「분석기 가져오기」의 카탈로그 동기화로 채워져요.
        </p>
      </div>

      {/* AI 분석 현황 — 승인·저장된 카드의 임베딩 커버리지와 검수 대기 */}
      <section className="rounded-md border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            AI 데이터
          </h2>
          <Link
            href="/catalog/cards?status=pending"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            검수 대기 {ai.pending.toLocaleString()}건 →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">분석 완료</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {ai.analyzed.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {ai.total.toLocaleString()}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">커버리지</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {ai.total > 0 ? Math.round((ai.analyzed / ai.total) * 100) : 0}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">모델</p>
            {ai.byModel.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">아직 없음</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {ai.byModel.map((m) => (
                  <li key={m.model} className="text-xs">
                    <span className="font-mono">{m.model}</span>
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {m.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">최근 분석</p>
            <p className="mt-1 text-sm text-foreground">
              {ai.latestAnalyzedAt ? formatKstDateTime(ai.latestAnalyzedAt) : "-"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          유저 제보는 분석 없이 접수되고, 관리자가 승인해 저장할 때 앞면을 임베딩해요.
          검수 화면의 「유사」로 기존·유사 카드를 먼저 확인할 수 있어요.
        </p>
      </section>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-border bg-card p-4 shadow-card"
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {stat.value.toLocaleString()}
            </p>
            {stat.href && (
              <Link
                href={stat.href}
                className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
              >
                관리 →
              </Link>
            )}
          </div>
        ))}
      </div>

      {teams.map((team) => {
        const teamMembers = members.filter((m) => m.teamIds.includes(team.id));
        const teamSeries = seriesRows.filter(
          (s) => s.teamId !== null && Number(s.teamId) === team.id,
        );
        return (
          <section
            key={team.id}
            className="space-y-4 rounded-md border border-border bg-card p-4 shadow-card sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Users className="h-4 w-4 text-primary" aria-hidden />
                {team.name}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  상품 {(countByTeam.get(team.id) ?? 0).toLocaleString()}개 ·
                  시리즈 {teamSeries.length}개
                </span>
                <SeriesCreateButton teamId={team.id} />
              </div>
            </div>

            {/* 멤버 — 상품 수와 함께 칩으로, 클릭 시 해당 멤버 상품 목록으로. */}
            <div className="flex flex-wrap gap-1.5">
              {teamMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  등록된 멤버가 없어요.
                </p>
              ) : (
                teamMembers.map((member) => (
                  <Link
                    key={member.id}
                    href={`/admin/products?team=${team.id}&member=${member.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <User
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                    {member.name}
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {countByMember.get(member.id) ?? 0}
                    </span>
                  </Link>
                ))
              )}
            </div>

            {/* 시리즈 표 */}
            {teamSeries.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>종류</TableHead>
                    <TableHead>시리즈</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">상품</TableHead>
                    <TableHead className="text-right">평균 시세(¥)</TableHead>
                    <TableHead className="w-20 text-right">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamSeries.map((series) => {
                    const agg = countBySeries.get(Number(series.id));
                    return (
                      <TableRow key={String(series.id)}>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {seriesKindLabel(series.kind)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {series.label}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {series.sku}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(agg?.count ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {agg?.avgJpy
                            ? `¥${agg.avgJpy.toLocaleString()}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <SeriesRowActions
                            series={{
                              id: Number(series.id),
                              sku: series.sku,
                              label: series.label,
                              kind: series.kind,
                              teamId:
                                series.teamId === null
                                  ? null
                                  : Number(series.teamId),
                            }}
                            productCount={agg?.count ?? 0}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        );
      })}

      {noSeriesCount > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Layers className="h-4 w-4" aria-hidden />
          시리즈 미연결 상품 {noSeriesCount.toLocaleString()}개 — 카드
          가져오기에서 「카탈로그 동기화」를 실행하면 연결돼요.
        </p>
      )}
    </div>
  );
}
