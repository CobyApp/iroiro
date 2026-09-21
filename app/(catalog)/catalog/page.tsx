import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Layers,
  Sparkles,
  Tag,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import { env } from "@/lib/env";
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
import { cardFrontUrl } from "@/modules/cards/types";

export const metadata: Metadata = { title: "홈" };

// 카탈로그 홈 — 오늘 할 일(검수 대기)과 데이터 건강(AI 커버리지·병기 누락)을 위에, 그룹 도감을 아래에.
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

  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const seriesLabel = new Map(series.map((s) => [s.id, s.labelKo ?? s.label]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const seriesMissingKo = series.filter(
    (s) => !s.labelKo && /[぀-ヿ一-鿿]/.test(s.label),
  ).length;
  const membersMissingHira = members.filter((m) => !m.nameI18n?.["ja-hira"]).length;
  const coverage = ai.total > 0 ? Math.round((ai.analyzed / ai.total) * 100) : 0;
  const unanalyzed = ai.total - ai.analyzed;

  const stats = [
    { label: "등록된 카드", value: counts.active, href: "/catalog/cards", icon: WalletCards },
    {
      label: "검수 대기",
      value: counts.pending,
      href: "/catalog/cards?view=pending",
      icon: ClipboardCheck,
      warn: counts.pending > 0,
    },
    { label: "그룹", value: teams.length, href: "/catalog/teams", icon: Users },
    { label: "멤버", value: members.length, href: "/catalog/members", icon: User },
    { label: "시리즈", value: series.length, href: "/catalog/series", icon: Layers },
    { label: "종류", value: kinds.length, href: "/catalog/kinds", icon: Tag },
  ];

  return (
    <div className="space-y-8">
      {/* 요약 타일 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group rounded-md border bg-card p-4 shadow-card transition-colors hover:border-primary/50 ${
                s.warn ? "border-amber-300 bg-amber-50/60" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs">{s.label}</span>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </div>
              <p
                className={`catalog-stat mt-2 text-2xl font-bold ${
                  s.warn ? "text-amber-800" : "text-foreground"
                }`}
              >
                {s.value.toLocaleString()}
              </p>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 검수 대기 큐 */}
        <section className="rounded-md border border-border bg-card p-4 shadow-card lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />
              검수 대기
              <span className="catalog-stat text-sm font-semibold text-muted-foreground">
                {counts.pending.toLocaleString()}
              </span>
            </h2>
            <Link
              href="/catalog/cards?view=pending"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              검수하기 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {pendingPreview.items.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              대기 중인 유저 제보가 없어요. 깨끗합니다 ✨
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {pendingPreview.items.map((card) => {
                const url = cardFrontUrl(card, env.R2_PUBLIC_BASE);
                return (
                  <li key={card.id} className="flex items-center gap-3 py-2">
                    <div className="h-12 w-[34px] shrink-0 overflow-hidden rounded-xs border border-border bg-muted">
                      {url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
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
        </section>

        {/* AI 커버리지 + 데이터 건강 */}
        <section className="space-y-4 rounded-md border border-border bg-card p-4 shadow-card lg:col-span-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              AI 분석 커버리지
            </h2>
            <div className="mt-3 flex items-end justify-between">
              <p className="catalog-stat text-3xl font-bold text-foreground">{coverage}%</p>
              <p className="text-xs text-muted-foreground">
                {ai.analyzed.toLocaleString()} / {ai.total.toLocaleString()}장
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${coverage}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
              <span>
                {ai.byModel.map((m) => `${m.model} ${m.count.toLocaleString()}`).join(" · ") || "모델 없음"}
              </span>
              {unanalyzed > 0 && (
                <Link href="/catalog/cards?ai=missing" className="font-medium text-primary hover:underline">
                  미분석 {unanalyzed.toLocaleString()}장 →
                </Link>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              최근 분석 {ai.latestAnalyzedAt ? formatKstDateTime(ai.latestAnalyzedAt) : "-"}
            </p>
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">데이터 점검</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              <HealthRow
                ok={seriesMissingKo === 0}
                label="일본어 시리즈의 한국어 병기"
                detail={seriesMissingKo === 0 ? "모두 입력" : `${seriesMissingKo}개 누락`}
                href="/catalog/series"
              />
              <HealthRow
                ok={membersMissingHira === 0}
                label="멤버 히라가나 표기"
                detail={membersMissingHira === 0 ? "모두 입력" : `${membersMissingHira}명 누락`}
                href="/catalog/members"
              />
              <HealthRow
                ok={counts.rejected === 0}
                label="반려 보관"
                detail={`${counts.rejected.toLocaleString()}건`}
                href="/catalog/cards?view=rejected"
                neutral
              />
            </ul>
          </div>
        </section>
      </div>

      {/* 그룹 도감 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">그룹</h2>
          <Link href="/catalog/teams" className="text-xs font-medium text-primary hover:underline">
            그룹 관리 →
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
            return (
              <article
                key={team.id}
                className="team-bar flex flex-col rounded-md border border-border bg-card p-4 shadow-card"
                style={{ ["--team-color" as string]: team.themeColor ?? undefined }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-foreground">{team.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {team.nameI18n?.["ja-jpan"] ?? team.nameI18n?.en ?? ""}
                      {team.debutDate && ` · 데뷔 ${team.debutDate}`}
                    </p>
                  </div>
                  <Link
                    href={`/catalog/teams/${team.id}/edit`}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    수정
                  </Link>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat href={`/catalog/cards?team=${team.id}`} label="카드" value={cards} />
                  <Stat href={`/catalog/members`} label="멤버" value={teamMembers.length} />
                  <Stat href={`/catalog/series?team=${team.id}`} label="시리즈" value={teamSeries} />
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {teamMembers.length === 0 ? (
                    <span className="text-xs text-muted-foreground">멤버 없음</span>
                  ) : (
                    teamMembers.map((m) => (
                      <Link
                        key={m.id}
                        href={`/catalog/cards?team=${team.id}&member=${m.id}`}
                        className="team-chip"
                        style={{ ["--team-color" as string]: team.themeColor ?? undefined }}
                        title={`${memberName.get(m.id)} 카드 보기`}
                      >
                        {m.name}
                      </Link>
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 최근 등록 */}
      {recent.items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">최근 등록된 카드</h2>
            <Link href="/catalog/cards" className="text-xs font-medium text-primary hover:underline">
              전체 보기 →
            </Link>
          </div>
          <ul className="scroll-x flex gap-3 overflow-x-auto pb-1">
            {recent.items.map((card) => {
              const url = cardFrontUrl(card, env.R2_PUBLIC_BASE);
              return (
                <li key={card.id} className="w-28 shrink-0">
                  <Link href={`/catalog/cards?q=${encodeURIComponent(card.itemCode ?? card.name)}`} className="group block">
                    <div className="aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted shadow-card">
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
                    <p className="mt-1 truncate text-[11px] text-foreground" title={card.name}>
                      {card.name}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="rounded-sm bg-muted/60 px-2 py-1.5 transition-colors hover:bg-muted">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="catalog-stat text-base font-bold text-foreground">{value.toLocaleString()}</dd>
    </Link>
  );
}

function HealthRow({
  ok,
  label,
  detail,
  href,
  neutral,
}: {
  ok: boolean;
  label: string;
  detail: string;
  href: string;
  /** 경고가 아니라 정보성(반려 보관 등) */
  neutral?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-foreground">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full ${
            ok || neutral ? "bg-accent" : "bg-amber-500"
          }`}
        />
        {label}
      </span>
      <Link
        href={href}
        className={`text-xs ${ok || neutral ? "text-muted-foreground" : "font-medium text-amber-700"} hover:underline`}
      >
        {detail}
      </Link>
    </li>
  );
}
