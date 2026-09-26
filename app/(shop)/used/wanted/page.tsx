import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import {
  listBuyRequestFacets,
  listBuyRequests,
} from "@/modules/used/lib/buy-queries";
import { BuyRequestCard } from "@/modules/used/components/BuyRequestCard";
import { UsedModeTabs } from "@/modules/used/components/UsedModeTabs";
import { EmptyState } from "@/components/EmptyState";
import { HScroll } from "@/components/HScroll";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";

export const metadata: Metadata = { title: "중고거래 · 삽니다" };

const PAGE_SIZE = 24;

type SearchParams = {
  team?: string;
  member?: string;
  q?: string;
  mine?: string;
  page?: string;
};

// 삽니다(매입 요청) 목록 — 팝니다(매물)의 역방향. 그룹/멤버 필터 칩 + 내 삽니다 보기.
export default async function BuyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const teamId = Number(sp.team) > 0 ? Number(sp.team) : undefined;
  const memberId = Number(sp.member) > 0 ? Number(sp.member) : undefined;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const mine = sp.mine === "1";

  const account = await getCurrentAccount();
  const [teams, members, facets, { items, total }] = await Promise.all([
    listTeams(),
    listMembers(),
    listBuyRequestFacets(),
    listBuyRequests({
      teamId,
      memberId,
      q,
      requesterAccountId: mine && account ? account.id : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const facetTeamSet = new Set(facets.teamIds);
  const visibleTeams = teams.filter((t) => facetTeamSet.has(t.id) || t.id === teamId);
  const teamMemberIds = teamId != null ? new Set(facets.memberIdsByTeam[teamId] ?? []) : null;
  const teamMembers =
    teamId != null
      ? members.filter(
          (m) => m.teamIds.includes(teamId) && (teamMemberIds?.has(m.id) || m.id === memberId),
        )
      : [];

  const qs = (patch: { team?: number; member?: number; page?: number; mine?: boolean }) => {
    const params = new URLSearchParams();
    const t = "team" in patch ? patch.team : teamId;
    const mb = "member" in patch ? patch.member : memberId;
    const isMine = "mine" in patch ? patch.mine : mine;
    const p = patch.page ?? 1;
    if (t) params.set("team", String(t));
    if (mb) params.set("member", String(mb));
    if (q) params.set("q", q);
    if (isMine) params.set("mine", "1");
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/used/wanted?${s}` : "/used/wanted";
  };

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
      active
        ? "border-primary bg-primary/10 font-medium text-primary"
        : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        title="중고거래"
        action={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/used/wanted/new">
              <Plus className="h-4 w-4" />
              삽니다 등록
            </Link>
          </Button>
        }
      />

      <UsedModeTabs active="buy" />

      {/* 그룹 → 멤버 필터 + 내 삽니다 토글. */}
      <div className="space-y-2">
        <HScroll className="scroll-x scroll-x-bleed flex gap-2 overflow-x-auto pb-1">
          {account && (
            <>
              <Link href={qs({ mine: !mine, page: 1 })} className={chip(mine)}>
                내 삽니다
              </Link>
              <Link href="/used/wanted/offers" className={chip(false)}>
                보낸 오퍼
              </Link>
              <span className="my-1 w-px shrink-0 bg-border" aria-hidden />
            </>
          )}
          <Link href={qs({ team: undefined, member: undefined, page: 1 })} className={chip(teamId === undefined)}>
            모든 그룹
          </Link>
          {visibleTeams.map((team) => (
            <Link
              key={team.id}
              href={qs({
                team: team.id,
                member: teamId === team.id ? memberId : undefined,
                page: 1,
              })}
              className={chip(teamId === team.id)}
            >
              {team.name}
            </Link>
          ))}
        </HScroll>
        {teamId !== undefined && teamMembers.length > 0 && (
          <HScroll className="scroll-x scroll-x-bleed flex gap-2 overflow-x-auto pb-1" aria-label="멤버 필터">
            <Link href={qs({ member: undefined, page: 1 })} className={chip(memberId === undefined)}>
              모든 멤버
            </Link>
            {teamMembers.map((member) => (
              <Link key={member.id} href={qs({ member: member.id, page: 1 })} className={chip(memberId === member.id)}>
                {member.name}
              </Link>
            ))}
          </HScroll>
        )}
      </div>

      <section className="space-y-3" data-page-section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">
            {mine ? "내 삽니다" : "삽니다 요청"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {q ? `“${q}” 검색 결과 ` : ""}
            {total.toLocaleString()}건
          </p>
        </div>
        {items.length === 0 ? (
          mine ? (
            <EmptyState
              emoji="🛍️"
              title="올린 삽니다가 없어요"
              description="사고 싶은 아이템을 등록하면 판매자가 오퍼를 보내요."
              action={{ href: "/used/wanted/new", label: "삽니다 등록" }}
            />
          ) : q || teamId || memberId ? (
            <EmptyState
              emoji="🔍"
              title="조건에 맞는 삽니다가 없어요"
              description="필터를 바꾸거나 전체에서 다시 찾아보세요."
              action={{ href: "/used/wanted", label: "전체 보기", variant: "outline" }}
            />
          ) : (
            <EmptyState
              emoji="🛍️"
              title="아직 삽니다가 없어요"
              description="사고 싶은 아이템을 먼저 등록해보세요!"
              action={{ href: "/used/wanted/new", label: "삽니다 등록" }}
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((request) => (
              <BuyRequestCard
                key={request.id}
                request={request}
                publicBaseUrl={env.R2_PUBLIC_BASE}
              />
            ))}
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2 pt-2" aria-label="페이지">
          {page > 1 && (
            <Link href={qs({ page: page - 1 })} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              이전
            </Link>
          )}
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={qs({ page: page + 1 })} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              다음
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
