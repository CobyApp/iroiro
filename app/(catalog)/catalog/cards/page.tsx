import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { db } from "@/lib/db";
import { listCards, countPendingCards } from "@/modules/cards/lib/queries";
import { CardTable } from "@/modules/cards/components/CardTable";
import {
  CARD_SOURCES,
  CARD_SOURCE_LABEL,
  CARD_STATUSES,
  CARD_STATUS_LABEL,
  type CardSource,
  type CardStatus,
} from "@/modules/cards/types";

export const metadata: Metadata = { title: "토레카 데이터" };

const PAGE_SIZE = 40;

type SearchParams = Promise<{
  team?: string;
  member?: string;
  series?: string;
  source?: string;
  status?: string;
  q?: string;
  page?: string;
}>;

// 토레카 마스터 관리 — 목록·필터·CSV 내보내기·검수.
export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const teamId = Number(sp.team) > 0 ? Number(sp.team) : undefined;
  const memberId = Number(sp.member) > 0 ? Number(sp.member) : undefined;
  const seriesId = Number(sp.series) > 0 ? Number(sp.series) : undefined;
  const source = CARD_SOURCES.includes(sp.source as CardSource)
    ? (sp.source as CardSource)
    : undefined;
  const status = CARD_STATUSES.includes(sp.status as CardStatus)
    ? (sp.status as CardStatus)
    : undefined;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ items, total }, pendingCount, teams, members, seriesRows] =
    await Promise.all([
      listCards({ teamId, memberId, seriesId, source, status, q, page, pageSize: PAGE_SIZE }),
      countPendingCards(),
      listTeams(),
      listMembers(),
      db.series.findMany({
        select: { id: true, teamId: true, label: true, kind: true },
        orderBy: { label: "asc" },
      }),
    ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));
  const memberOptions = members.map((m) => ({
    id: m.id,
    name: m.name,
    teamIds: m.teamIds,
  }));
  const seriesOptions = seriesRows.map((s) => ({
    id: Number(s.id),
    teamId: s.teamId === null ? null : Number(s.teamId),
    label: s.label,
    kind: s.kind,
  }));

  // 현재 조건 유지 링크 — 필터 칩·페이지네이션·CSV가 공유.
  const qs = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      team: teamId,
      member: memberId,
      series: seriesId,
      source,
      status,
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

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary/10 font-medium text-primary"
        : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">토레카 데이터</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            카드 원본 데이터 {total.toLocaleString()}건
            {pendingCount > 0 && (
              <Link
                href={`/catalog/cards${qs({ status: "pending", page: undefined })}`}
                className="ml-2 font-medium text-primary underline-offset-2 hover:underline"
              >
                검수 대기 {pendingCount}건 →
              </Link>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={`/catalog/cards/export${qs({ page: undefined })}`}>
              <Download className="h-4 w-4" />
              CSV 내보내기
            </a>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/catalog/cards/new">
              <Plus className="h-4 w-4" />
              토레카 등록
            </Link>
          </Button>
        </div>
      </div>

      {/* 필터 — 출처·상태·그룹 칩 + 검색 */}
      <div className="space-y-2">
        <form action="/catalog/cards" className="max-w-xs">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="이름·아이템 코드 검색"
            className="h-9 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary/50"
          />
        </form>
        <div className="scroll-x flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          <Link href={`/catalog/cards${qs({ source: undefined })}`} className={chip(!source)}>
            모든 출처
          </Link>
          {CARD_SOURCES.map((s) => (
            <Link key={s} href={`/catalog/cards${qs({ source: s })}`} className={chip(source === s)}>
              {CARD_SOURCE_LABEL[s]}
            </Link>
          ))}
          <span className="mx-1 my-auto h-4 w-px bg-border" aria-hidden />
          <Link href={`/catalog/cards${qs({ status: undefined })}`} className={chip(!status)}>
            모든 상태
          </Link>
          {CARD_STATUSES.map((s) => (
            <Link key={s} href={`/catalog/cards${qs({ status: s })}`} className={chip(status === s)}>
              {CARD_STATUS_LABEL[s]}
            </Link>
          ))}
          <span className="mx-1 my-auto h-4 w-px bg-border" aria-hidden />
          <Link href={`/catalog/cards${qs({ team: undefined, member: undefined })}`} className={chip(!teamId)}>
            모든 그룹
          </Link>
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/catalog/cards${qs({ team: team.id, member: undefined })}`}
              className={chip(teamId === team.id)}
            >
              {team.name}
            </Link>
          ))}
        </div>
        {teamId !== undefined && (
          <div className="scroll-x flex flex-wrap gap-1.5 overflow-x-auto pb-1">
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
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-12 text-center text-muted-foreground">
          조건에 맞는 카드가 없어요.
        </div>
      ) : (
        <CardTable
          items={items}
          teams={teamOptions}
          members={memberOptions}
          series={seriesOptions}
          publicBaseUrl={env.R2_PUBLIC_BASE}
        />
      )}

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2" aria-label="페이지">
          {page > 1 && (
            <Link
              href={`/catalog/cards${qs({ page: page - 1 })}`}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            >
              이전
            </Link>
          )}
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/catalog/cards${qs({ page: page + 1 })}`}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            >
              다음
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
