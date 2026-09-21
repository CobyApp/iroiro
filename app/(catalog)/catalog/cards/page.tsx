import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesOptions } from "@/modules/series/lib/queries";
import { countCardsByStatus, listCards } from "@/modules/cards/lib/queries";
import { CardTable } from "@/modules/cards/components/CardTable";
import { CardGrid } from "@/modules/cards/components/CardGrid";
import { CatalogPageHeader } from "@/modules/admin/components/CatalogPageHeader";
import {
  CARD_STATUSES,
  CARD_STATUS_LABEL,
  type CardStatus,
} from "@/modules/cards/types";

export const metadata: Metadata = { title: "토레카" };

const PAGE_SIZE = 48;
const ADMIN_VIEW = { kind: "admin" } as const;

type SearchParams = Promise<{
  view?: string;
  status?: string;
  team?: string;
  member?: string;
  series?: string;
  ai?: string;
  q?: string;
  page?: string;
}>;

// 토레카 — 등록(공개)된 카드와 유저 제보(검수 대기·반려)를 탭으로 분리해 본다.
// 공개 카드는 도감형 그리드(+풀스크린 확대·상세 AI 값), 검수 대기는 승인·반려 작업 표.
export default async function CatalogCardsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  // view 가 정본. 예전 링크(?status=)도 같은 뜻으로 받는다.
  const rawView = sp.view ?? sp.status;
  const view: CardStatus = CARD_STATUSES.includes(rawView as CardStatus)
    ? (rawView as CardStatus)
    : "active";
  const teamId = Number(sp.team) > 0 ? Number(sp.team) : undefined;
  const memberId = Number(sp.member) > 0 ? Number(sp.member) : undefined;
  const seriesId = Number(sp.series) > 0 ? Number(sp.series) : undefined;
  const ai = sp.ai === "done" || sp.ai === "missing" ? sp.ai : undefined;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ items, total }, counts, teams, members, seriesOptions] = await Promise.all([
    listCards({
      teamId,
      memberId,
      seriesId,
      status: view,
      analyzed: ai === undefined ? undefined : ai === "done",
      q,
      page,
      pageSize: PAGE_SIZE,
    }),
    countCardsByStatus(),
    listTeams(),
    listMembers(),
    listSeriesOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name, teamIds: m.teamIds }));

  // 현재 조건 유지 링크 — 탭·필터 칩·페이지네이션·CSV가 공유.
  const qs = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      view,
      team: teamId,
      member: memberId,
      series: seriesId,
      ai,
      q,
      page: undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(base)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  // 필터 칩 — Storybook › Patterns › SearchAndFilter 의 outline 버튼 리듬.
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-foreground hover:bg-muted",
    );

  const TABS: { key: CardStatus; label: string; hint: string }[] = [
    { key: "active", label: "등록된 카드", hint: "카탈로그에 공개된 마스터" },
    { key: "pending", label: "검수 대기", hint: "유저 제보 — 승인하면 AI 분석 후 공개" },
    { key: "rejected", label: "반려", hint: "반려 사유와 함께 보관" },
  ];

  return (
    <div className="space-y-6">
      <CatalogPageHeader
        eyebrow="TRADING CARDS"
        title="토레카"
        count={counts.active}
        description="등록된 카드는 도감처럼 훑고 눌러서 확대해요. 「상세·AI」로 임베딩 값을, 검수 대기 탭에서 제보를 승인·반려해요."
      >
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={`/catalog/cards/export${qs({ page: undefined, view: undefined, status: view })}`}>
            <Download className="h-4 w-4" />
            CSV
          </a>
        </Button>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/catalog/cards/new">
            <Plus className="h-4 w-4" />
            토레카 등록
          </Link>
        </Button>
      </CatalogPageHeader>

      {/* 탭 — 등록된 카드 / 검수 대기 / 반려 (내비와 같은 알약 리듬) */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="카드 구분">
        {TABS.map((tab) => {
          const active = view === tab.key;
          const n = counts[tab.key];
          return (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={active}
              href={`/catalog/cards${qs({ view: tab.key, member: undefined, ai: undefined })}`}
              title={tab.hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "catalog-stat rounded-full px-1.5 py-px text-[11px]",
                  tab.key === "pending" && n > 0 ? "bg-lemon text-ink" : "bg-muted text-muted-foreground",
                )}
              >
                {n.toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>

      {/* 검색 + 필터 */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <form action="/catalog/cards" className="relative max-w-md">
            <input type="hidden" name="view" value={view} />
            {teamId !== undefined && <input type="hidden" name="team" value={teamId} />}
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="카드 이름·아이템 코드 검색"
              className="h-10 w-full rounded-full border border-input bg-card pl-10 pr-4 text-sm outline-none focus:border-primary/60"
            />
          </form>
          <div className="scroll-x flex flex-wrap gap-1.5 overflow-x-auto pb-0.5">
            <Link href={`/catalog/cards${qs({ team: undefined, member: undefined })}`} className={chip(!teamId)}>
              모든 그룹
            </Link>
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/catalog/cards${qs({ team: team.id, member: undefined })}`}
                className={teamId === team.id ? "team-chip !py-1" : chip(false)}
                style={teamId === team.id ? { ["--team-color" as string]: team.themeColor ?? undefined } : undefined}
              >
                {team.name}
              </Link>
            ))}
            {view === "active" && (
              <>
                <span className="mx-1 my-auto h-4 w-px bg-border" aria-hidden />
                <Link href={`/catalog/cards${qs({ ai: undefined })}`} className={chip(!ai)}>
                  AI 전체
                </Link>
                <Link href={`/catalog/cards${qs({ ai: "done" })}`} className={chip(ai === "done")}>
                  분석 완료
                </Link>
                <Link href={`/catalog/cards${qs({ ai: "missing" })}`} className={chip(ai === "missing")}>
                  미분석
                </Link>
              </>
            )}
          </div>
          {teamId !== undefined && (
            <div className="scroll-x flex flex-wrap gap-1.5 overflow-x-auto pb-0.5">
              <Link href={`/catalog/cards${qs({ member: undefined })}`} className={chip(!memberId)}>
                모든 멤버
              </Link>
              {members
                .filter((m) => m.teamIds.includes(teamId))
                .map((member) => (
                  <Link
                    key={member.id}
                    href={`/catalog/cards${qs({ member: member.id })}`}
                    className={chip(memberId === member.id)}
                  >
                    {member.name}
                  </Link>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {CARD_STATUS_LABEL[view]} {total.toLocaleString()}장
        {totalPages > 1 && ` · ${page} / ${totalPages} 페이지`}
      </p>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Search className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-lg">
              {view === "pending" ? "검수 대기 중인 제보가 없어요" : "조건에 맞는 카드가 없어요"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">필터를 바꾸거나 검색어를 지워보세요.</p>
          </CardContent>
        </Card>
      ) : view === "active" ? (
        <CardGrid
          items={items}
          teams={teamOptions}
          members={memberOptions}
          series={seriesOptions}
          imageView={ADMIN_VIEW}
        />
      ) : (
        <Card className="overflow-hidden">
          <CardTable
            items={items}
            teams={teamOptions}
            members={memberOptions}
            series={seriesOptions}
            imageView={ADMIN_VIEW}
          />
        </Card>
      )}

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2" aria-label="페이지">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/catalog/cards${qs({ page: page - 1 })}`}>이전</Link>
            </Button>
          )}
          <span className="catalog-stat inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-sm">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/catalog/cards${qs({ page: page + 1 })}`}>다음</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
