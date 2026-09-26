import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Clock, Plus } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import {
  listEndingSoonUsedAuctions,
  listNewestUsedListings,
  listUsedItemTypesInUse,
  listUsedListingFacets,
  listUsedListings,
} from "@/modules/used/lib/queries";
import { USED_ITEM_TYPE_LABEL, type UsedItemType } from "@/modules/used/types";
import {
  pickSaleModesWithListings,
  pickWithListings,
} from "@/modules/products/lib/facets";
import { getUsedWishlistIds } from "@/modules/used/lib/wishlist";
import { UsedListingCard } from "@/modules/used/components/UsedListingCard";
import { UsedRow } from "@/modules/used/components/UsedRow";
import { UsedFaveSection } from "@/modules/used/components/UsedFaveSection";
import { UsedModeTabs } from "@/modules/used/components/UsedModeTabs";
import { EmptyState } from "@/components/EmptyState";
import { HScroll } from "@/components/HScroll";
import { InPageSearchBar } from "../_components/HeaderLeading";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";

export const metadata: Metadata = { title: "중고거래" };

const PAGE_SIZE = 24;

type UsedSearchParams = {
  mode?: string;
  team?: string;
  member?: string;
  item?: string;
  q?: string;
  page?: string;
};

// 중고거래 홈 — 둘러보기와 같은 구성(최애 섹션·마감 임박·필터 칩)으로
// 유저 매물을 보여준다. 기능 OFF면 존재 자체를 숨긴다(404).
export default async function UsedHomePage({
  searchParams,
}: {
  searchParams: Promise<UsedSearchParams>;
}) {
  const sp = await searchParams;
  const mode =
    sp.mode === "fixed" || sp.mode === "auction" ? sp.mode : undefined;
  const teamId = Number(sp.team) > 0 ? Number(sp.team) : undefined;
  const memberId = Number(sp.member) > 0 ? Number(sp.member) : undefined;
  const itemType =
    sp.item && sp.item in USED_ITEM_TYPE_LABEL ? sp.item : undefined;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  // 검색·필터가 없는 기본 화면에서만 큐레이션 섹션(최애·마감 임박)을 보여준다.
  const isDefaultBrowse = !mode && !teamId && !memberId && !itemType && !q && page === 1;

  // facets: 노출 중인 매물(판매중·거래중) 기준 — 매물이 있는 그룹·멤버·판매방식·종류만 칩으로.
  const [account, teams, members, facets, itemTypesInUse] = await Promise.all([
    getCurrentAccount(),
    listTeams(),
    listMembers(),
    listUsedListingFacets(),
    listUsedItemTypesInUse(),
  ]);
  const [{ items, total }, endingSoon, usedWishedIds] = await Promise.all([
    isDefaultBrowse
      ? listNewestUsedListings(PAGE_SIZE).then((rows) => ({
          items: rows,
          total: rows.length,
        }))
      : listUsedListings({
          saleMode: mode,
          teamId,
          memberId,
          itemType,
          q,
          page,
          pageSize: PAGE_SIZE,
        }),
    isDefaultBrowse ? listEndingSoonUsedAuctions(8) : Promise.resolve([]),
    account ? getUsedWishlistIds(account.id) : Promise.resolve(undefined),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLoggedIn = account !== null;

  // 현재 조건을 유지한 채 일부만 바꾼 링크 — 페이지 이동에도 필터가 풀리지 않게.
  const qs = (patch: {
    mode?: string;
    team?: number;
    member?: number;
    item?: string;
    page?: number;
  }) => {
    const params = new URLSearchParams();
    const m = "mode" in patch ? patch.mode : mode;
    const t = "team" in patch ? patch.team : teamId;
    const mb = "member" in patch ? patch.member : memberId;
    const it = "item" in patch ? patch.item : itemType;
    const p = patch.page ?? 1;
    if (m) params.set("mode", m);
    if (t) params.set("team", String(t));
    if (mb) params.set("member", String(mb));
    if (it) params.set("item", it);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/used?${s}` : "/used";
  };

  // 선택된 값은 매물이 0이어도 남겨서(공유 URL 등) 해제할 수 있게 한다.
  const visibleTeams = pickWithListings(teams, facets.teams, teamId);
  const teamMembers =
    teamId !== undefined
      ? pickWithListings(
          members.filter((m) => m.teamIds.includes(teamId)),
          facets.membersByTeam[String(teamId)],
          memberId,
        )
      : [];
  const visibleModes = pickSaleModesWithListings(
    ["fixed", "auction"] as const,
    facets.saleModes,
    mode,
  );
  const modeTabs: { value: "fixed" | "auction" | undefined; label: string }[] = [
    { value: undefined, label: "전체" },
    ...visibleModes.map((value) => ({
      value,
      label: value === "fixed" ? "바로 판매" : "입찰 경매",
    })),
  ];

  // 노출 중인 굿즈 종류 칩(선택값은 0이어도 유지). 종류가 1개뿐이면 굳이 안 보여준다.
  const orderedItemTypes = (Object.keys(USED_ITEM_TYPE_LABEL) as UsedItemType[]).filter(
    (t) => itemTypesInUse.includes(t) || t === itemType,
  );

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
            <Link href="/used/new">
              <Plus className="h-4 w-4" />
              판매하기
            </Link>
          </Button>
        }
      />

      <UsedModeTabs active="sell" />

      {/* 데스크톱 검색바 — 타이틀 아래(모바일은 상단 헤더 검색). */}
      <InPageSearchBar />

      {/* 판매 방식 + 그룹 → 멤버 필터 칩 — 링크 기반이라 뒤로가기·공유에 안전. */}
      <div className="space-y-2">
        <HScroll className="scroll-x scroll-x-bleed flex gap-2 overflow-x-auto pb-1">
          {modeTabs.map((tab) => (
            <Link
              key={tab.label}
              href={qs({ mode: tab.value, page: 1 })}
              className={chip(mode === tab.value)}
            >
              {tab.label}
            </Link>
          ))}
          <span className="my-1 w-px shrink-0 bg-border" aria-hidden />
          <Link
            href={qs({ team: undefined, member: undefined, page: 1 })}
            className={chip(teamId === undefined)}
          >
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
        {orderedItemTypes.length > 1 && (
          <HScroll className="scroll-x scroll-x-bleed flex gap-2 overflow-x-auto pb-1">
            <Link href={qs({ item: undefined, page: 1 })} className={chip(itemType === undefined)}>
              모든 종류
            </Link>
            {orderedItemTypes.map((t) => (
              <Link key={t} href={qs({ item: t, page: 1 })} className={chip(itemType === t)}>
                {USED_ITEM_TYPE_LABEL[t]}
              </Link>
            ))}
          </HScroll>
        )}
        {teamId !== undefined && teamMembers.length > 0 && (
          <HScroll
            className="scroll-x scroll-x-bleed flex gap-2 overflow-x-auto pb-1"
            aria-label="멤버 필터"
          >
            <Link
              href={qs({ member: undefined, page: 1 })}
              className={chip(memberId === undefined)}
            >
              모든 멤버
            </Link>
            {teamMembers.map((member) => (
              <Link
                key={member.id}
                href={qs({ member: member.id, page: 1 })}
                className={chip(memberId === member.id)}
              >
                {member.name}
              </Link>
            ))}
          </HScroll>
        )}
      </div>

      {/* 기본 화면 큐레이션 — 내 최애 매물 + 마감 임박 경매. */}
      {isDefaultBrowse && (
        <Suspense fallback={null}>
          <UsedFaveSection />
        </Suspense>
      )}
      {isDefaultBrowse && endingSoon.length > 0 && (
        <section className="kawaii-products-section" data-page-section>
          <div className="kawaii-section-heading">
            <div>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                ENDING SOON
              </span>
              <h2>마감 임박 경매</h2>
            </div>
            <Link href="/used?mode=auction" className="kawaii-more-link">
              전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <UsedRow
            listings={endingSoon}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={usedWishedIds}
            isLoggedIn={isLoggedIn}
          />
        </section>
      )}

      <section className="space-y-3" data-page-section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">
            {isDefaultBrowse ? "새로 올라온 매물" : "매물"}
          </h2>
          {!isDefaultBrowse && (
            <p className="text-sm text-muted-foreground">
              {q ? `“${q}” 검색 결과 ` : ""}
              {total.toLocaleString()}건
            </p>
          )}
        </div>
        {items.length === 0 ? (
          q || teamId || memberId || mode || itemType ? (
            <EmptyState
              emoji="🔍"
              title="조건에 맞는 매물이 없어요"
              description="필터를 바꾸거나 전체에서 다시 찾아보세요."
              action={{ href: "/used", label: "전체 매물 보기", variant: "outline" }}
            />
          ) : (
            <EmptyState
              emoji="🛒"
              title="아직 매물이 없어요"
              description="첫 판매자가 되어보세요!"
              action={{ href: "/used/new", label: "판매하기" }}
            />
          )
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
            {items.map((listing) => (
              <UsedListingCard
                key={listing.id}
                listing={listing}
                publicBaseUrl={env.R2_PUBLIC_BASE}
                wished={usedWishedIds?.has(listing.id) ?? false}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>
        )}
      </section>

      {!isDefaultBrowse && totalPages > 1 && (
        <nav className="flex justify-center gap-2 pt-2" aria-label="페이지">
          {page > 1 && (
            <Link
              href={qs({ page: page - 1 })}
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
              href={qs({ page: page + 1 })}
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
