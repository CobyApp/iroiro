import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardCheck,
  Layers,
  Sparkles,
  Tag,
  User,
  Users,
  WalletCards, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatKstDateTime, formatKstRelative } from "@/lib/datetime";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesWithCounts } from "@/modules/series/lib/queries";
import { listSeriesKinds } from "@/modules/series/lib/kinds-queries";
import {
  countActiveCardsByTeam,
  countCardsByStatus,
  getCardAnalysisSummary,
  listCards,
} from "@/modules/cards/lib/queries";
import { cardImageSrc } from "@/modules/cards/types";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export const metadata: Metadata = { title: "홈" };

const ADMIN_VIEW = { kind: "admin" } as const;

// 카탈로그 홈 — 오늘 할 일(검수 대기)과 데이터 건강(AI 커버리지·병기 누락)을 위에, 그룹 도감을 아래에.
// 카드·타일은 디자인 시스템 공용 Card 를 쓰고(Storybook › Design System), 그룹 고유색만 카탈로그 유틸(team-*).
export default async function CatalogHomePage() {
  const [teams, members, series, kinds, counts, byTeam, ai, pendingPreview, recent] =
    await Promise.all([
      listTeams(),
      listMembers(),
      listSeriesWithCounts(),
      listSeriesKinds(),
      countCardsByStatus(),
      countActiveCardsByTeam(),
      getCardAnalysisSummary(),
      listCards({ status: "pending", pageSize: 6 }),
      listCards({ status: "active", pageSize: 12 }),
    ]);

  const seriesLabel = new Map(series.map((s) => [s.id, s.labelKo ?? s.label]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const seriesMissingKo = series.filter(
    (s) => !s.labelKo && /[぀-ヿ一-鿿]/.test(s.label),
  ).length;
  const membersMissingHira = members.filter((m) => !m.nameI18n?.["ja-hira"]).length;
  const coverage = ai.total > 0 ? Math.round((ai.analyzed / ai.total) * 100) : 0;
  const unanalyzed = ai.total - ai.analyzed;

  const stats = [
    { label: "등록된 카드", value: counts.active, href: "/admin/catalog/cards", icon: WalletCards },
    {
      label: "검수 대기",
      value: counts.pending,
      href: "/admin/catalog/cards?view=pending",
      icon: ClipboardCheck,
      warn: counts.pending > 0,
    },
    { label: "그룹", value: teams.length, href: "/admin/catalog/teams", icon: Users },
    { label: "멤버", value: members.length, href: "/admin/catalog/members", icon: User },
    { label: "시리즈", value: series.length, href: "/admin/catalog/series", icon: Layers },
    { label: "종류", value: kinds.length, href: "/admin/catalog/kinds", icon: Tag },
  ];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="TRADING CARD ARCHIVE"
        title="카탈로그 홈"
        description="토레카 마스터 데이터 — 검수할 제보, AI 분석 현황, 그룹별 도감을 한 화면에서 살펴요."
      >
        {/* 사진 포함 전체 내보내기 — catalog.json + cards.csv + images/ 를 ZIP 으로. */}
        <a
          href="/admin/catalog/export"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          전체 내보내기 (사진 포함)
        </a>
      </AdminPageHeader>

      {/* 요약 타일 — 폰에서는 3열 두 줄(≈110px)로 압축, lg 부터 한 줄 */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="group">
              <Card className={cn("h-full transition-colors group-hover:border-primary/50", s.warn && "border-primary/40 bg-primary/5")}>
                <CardHeader className="p-3 pb-0.5 sm:p-4 sm:pb-1">
                  <div className="flex items-center justify-between gap-1">
                    <CardTitle className="min-w-0 truncate font-sans text-[11px] font-medium text-muted-foreground sm:text-xs">
                      {s.label}
                    </CardTitle>
                    <span className={cn("shrink-0 text-muted-foreground", s.warn && "text-primary")}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                  <p className={cn("catalog-stat font-display text-xl tabular-nums sm:text-2xl", s.warn && "text-primary")}>
                    {s.value.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 검수 대기 큐 */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-end justify-between p-5 pb-3">
            <div>
              <p className="shop-section-eyebrow">REVIEW QUEUE</p>
              <CardTitle className="mt-1 text-lg">
                검수 대기{" "}
                <span className="catalog-stat font-sans text-base text-muted-foreground">
                  {counts.pending.toLocaleString()}
                </span>
              </CardTitle>
            </div>
            <Link
              href="/admin/catalog/cards?view=pending"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              검수하기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {pendingPreview.items.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                  <ClipboardCheck className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm text-muted-foreground">대기 중인 유저 제보가 없어요.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {pendingPreview.items.map((card) => {
                  const url = cardImageSrc(card, ADMIN_VIEW);
                  return (
                    <li key={card.id} className="flex items-center gap-3 py-2.5">
                      <div className="h-12 w-[34px] shrink-0 overflow-hidden rounded-xs border border-border bg-lilac">
                        {url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          <span className="catalog-mono mr-1 text-muted-foreground">#{card.id}</span>
                          {card.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {card.teamId !== null ? teamName.get(card.teamId) : "-"}
                          {card.seriesId !== null && ` · ${seriesLabel.get(card.seriesId) ?? ""}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatKstRelative(card.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* AI 커버리지 + 데이터 점검 */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-5 pb-3">
            <p className="shop-section-eyebrow">AI</p>
            <CardTitle className="mt-1 flex items-center gap-1.5 text-lg">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              분석 커버리지
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div>
              <div className="flex items-end justify-between">
                <p className="catalog-stat font-display text-3xl">{coverage}%</p>
                <p className="text-xs text-muted-foreground">
                  {ai.analyzed.toLocaleString()} / {ai.total.toLocaleString()}장
                </p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${coverage}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                <span className="catalog-mono min-w-0 break-all">
                  {ai.byModel.map((m) => `${m.model} ${m.count.toLocaleString()}`).join(" · ") || "모델 없음"}
                </span>
                {unanalyzed > 0 && (
                  <Link href="/admin/catalog/cards?ai=missing" className="font-medium text-primary">
                    미분석 {unanalyzed.toLocaleString()}장 →
                  </Link>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                최근 분석 {ai.latestAnalyzedAt ? formatKstDateTime(ai.latestAnalyzedAt) : "-"} · 카드
                「상세·AI」에서 임베딩 값을 볼 수 있어요.
              </p>
            </div>

            <div className="border-t border-border/70 pt-3">
              <p className="shop-section-eyebrow">DATA HEALTH</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <HealthRow
                  ok={seriesMissingKo === 0}
                  label="일본어 시리즈의 한국어 병기"
                  detail={seriesMissingKo === 0 ? "모두 입력" : `${seriesMissingKo}개 누락`}
                  href="/admin/catalog/series"
                />
                <HealthRow
                  ok={membersMissingHira === 0}
                  label="멤버 히라가나 표기"
                  detail={membersMissingHira === 0 ? "모두 입력" : `${membersMissingHira}명 누락`}
                  href="/admin/catalog/members"
                />
                <HealthRow
                  ok
                  label="반려 보관"
                  detail={`${counts.rejected.toLocaleString()}건`}
                  href="/admin/catalog/cards?view=rejected"
                />
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 그룹 도감 */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="shop-section-eyebrow">GROUPS</p>
            <h2 className="shop-section-title">그룹 도감</h2>
          </div>
          <Link href="/admin/catalog/teams" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            그룹 관리 <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const teamMembers = members
              .filter((m) => m.teamIds.includes(team.id))
              .sort(
                (a, b) =>
                  (a.displayOrderByTeam[team.id] ?? 999) - (b.displayOrderByTeam[team.id] ?? 999),
              );
            const teamSeries = series.filter((s) => s.teamId === team.id).length;
            const cards = byTeam.get(team.id) ?? 0;
            const color = { ["--team-color" as string]: team.themeColor ?? undefined };
            return (
              <Card key={team.id} className="team-bar flex flex-col p-5" style={color}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg">{team.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {team.nameI18n?.["ja-jpan"] ?? team.nameI18n?.en ?? ""}
                      {team.debutDate && ` · 데뷔 ${team.debutDate}`}
                    </p>
                  </div>
                  <Link
                    href={`/admin/catalog/teams/${team.id}/edit`}
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    수정
                  </Link>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat href={`/admin/catalog/cards?team=${team.id}`} label="카드" value={cards} />
                  <Stat href="/admin/catalog/members" label="멤버" value={teamMembers.length} />
                  <Stat href={`/admin/catalog/series?team=${team.id}`} label="시리즈" value={teamSeries} />
                </dl>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {teamMembers.length === 0 ? (
                    <span className="text-xs text-muted-foreground">멤버 없음</span>
                  ) : (
                    teamMembers.map((m) => (
                      <Link
                        key={m.id}
                        href={`/admin/catalog/cards?team=${team.id}&member=${m.id}`}
                        className="team-chip"
                        style={color}
                        title={`${m.name} 카드 보기`}
                      >
                        {m.name}
                      </Link>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 최근 등록 */}
      {recent.items.length > 0 && (
        <Card className="p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3 border-b border-border/70 pb-4">
            <div>
              <p className="shop-section-eyebrow">JUST ADDED</p>
              <h2 className="shop-section-title">최근 등록된 카드</h2>
            </div>
            <Link href="/admin/catalog/cards" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="scroll-x mt-5 flex gap-3 overflow-x-auto pb-1">
            {recent.items.map((card) => {
              const url = cardImageSrc(card, ADMIN_VIEW);
              return (
                <li key={card.id} className="w-28 shrink-0">
                  <Link
                    href={`/admin/catalog/cards?q=${encodeURIComponent(card.itemCode ?? card.name)}`}
                    className="group block space-y-1.5"
                  >
                    <div className="aspect-[63/88] overflow-hidden rounded-sm border border-border bg-lilac">
                      {url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={card.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                        />
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground" title={card.name}>
                      {card.name}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="rounded-sm bg-muted px-2 py-2 transition-colors hover:bg-lilac-100">
      <dt className="text-[10px] tracking-[0.09em] text-muted-foreground">{label}</dt>
      <dd className="catalog-stat font-display text-base tabular-nums sm:text-lg">{value.toLocaleString()}</dd>
    </Link>
  );
}

function HealthRow({
  ok,
  label,
  detail,
  href,
}: {
  ok: boolean;
  label: string;
  detail: string;
  href: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", ok ? "bg-mint" : "bg-primary")} />
        {label}
      </span>
      <Link href={href} className={cn("text-xs", ok ? "text-muted-foreground" : "font-medium text-primary")}>
        {detail}
      </Link>
    </li>
  );
}
