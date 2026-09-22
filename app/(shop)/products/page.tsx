import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, Gavel } from "lucide-react";
import { env } from "@/lib/env";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductFilters } from "@/modules/products/components/ProductFilters";
import { ProductGrid } from "@/modules/products/components/ProductGrid";
import { ProductPagination } from "@/modules/products/components/ProductPagination";
import { ProductSort } from "@/modules/products/components/ProductSort";
import { parseProductFilters } from "@/modules/products/lib/filters";
import {
  listLiveAuctions,
  listProductFacets,
  listProducts,
} from "@/modules/products/lib/queries";
import { ProductRow } from "@/modules/products/components/ProductRow";
import { settleDueAuctions } from "@/modules/auction/lib/settle";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getWishlistProductIds } from "@/modules/wishlist/lib/queries";
import { InPageSearchBar } from "../_components/HeaderLeading";

export const metadata: Metadata = { title: "둘러보기" };

// 둘러보기의 상세 카탈로그 — 홈 큐레이션에서 이어지는 검색·필터·정렬 화면.
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = parseProductFilters(params);

  return (
    <div className="shop-page-frame space-y-5">
      {/* 검색은 상단 헤더 검색바가 담당한다(탭별 검색). 여기선 필터·정렬만. */}
      <Suspense fallback={<div className="h-10" />}>
        {/* 모바일 정렬은 별도 줄 대신 필터의 토글 줄 안에 끼워 상단 높이를 줄인다.
           데스크톱은 지금처럼 필터 오른쪽에 따로 렌더. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <ProductFiltersWrapper filter={filter} />
          <div className="hidden sm:block">
            <ProductSort filter={filter} basePath="/products" />
          </div>
        </div>
      </Suspense>
      <Suspense key={JSON.stringify(filter)} fallback={null}>
        <ProductsView filter={filter} />
      </Suspense>
    </div>
  );
}

async function ProductFiltersWrapper({
  filter,
}: {
  filter: ReturnType<typeof parseProductFilters>;
}) {
  // 고객 화면은 매물이 있는 그룹·멤버·판매방식만 칩으로 — 빈 결과 태그를 없앤다.
  const [teams, members, facets] = await Promise.all([
    listTeams(),
    listMembers(),
    listProductFacets(),
  ]);
  return (
    <ProductFilters
      filter={filter}
      teams={teams}
      members={members}
      facets={facets}
      basePath="/products"
    />
  );
}

async function ProductsView({
  filter,
}: {
  filter: ReturnType<typeof parseProductFilters>;
}) {
  const hasFilters = Boolean(
    filter.teamId ||
    filter.memberId ||
    filter.itemType ||
    filter.condition ||
    filter.saleMode ||
    filter.stock,
  );
  // 기본 화면(검색·필터 없음)에서는 진행중 경매를 상단 전용 행으로 분리하고
  // 그리드에선 제외해 섞이지 않게 한다. 검색·필터 시에는 한 그리드로 통합.
  const isDefaultBrowse = !filter.q && !hasFilters;

  // 공개 페이지는 판매중(active) 상품만 노출 — draft·archived는 어드민 전용.
  const publicFilter = {
    ...filter,
    saleStatus: "active" as const,
    excludeLiveAuctions: isDefaultBrowse,
    // 품절·종료 경매는 항상 뒤로 — 구매 가능한 매물이 먼저 보인다.
    deprioritizeUnavailable: true,
  };
  const account = await getCurrentAccount();

  // 마감시각 지난 경매를 먼저 정산 — 행/그리드가 항상 최신 상태로 나뉜다.
  if (isDefaultBrowse) await settleDueAuctions();

  const [{ items, total }, liveAuctions, teams, members, wishedIds] =
    await Promise.all([
      listProducts(publicFilter),
      isDefaultBrowse ? listLiveAuctions() : Promise.resolve([]),
      listTeams(),
      listMembers(),
      account ? getWishlistProductIds(account.id) : Promise.resolve(undefined),
    ]);

  return (
    <div className="space-y-6">
      {/* 데스크톱 검색바 — 목록 상단(모바일은 상단 헤더 검색). */}
      <InPageSearchBar />

      {liveAuctions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
              <Gavel className="h-4 w-4 text-primary" aria-hidden />
              입찰 진행중
              <span className="text-xs font-normal text-muted-foreground">
                마감 임박순
              </span>
            </h2>
            <Link href="/products?mode=auction" className="kawaii-more-link">
              전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ProductRow
            products={liveAuctions}
            teams={teams}
            members={members}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={wishedIds}
            viewerAccountId={account?.id ?? null}
          />
        </section>
      )}
      {/* 결과 수 + 정렬 — 정렬은 결과를 다루는 컨트롤이라 필터 줄이 아니라 여기에.
         (데스크톱 정렬은 상단 필터 오른쪽에 있으므로 모바일에서만 노출.) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filter.q ? (
            <>&ldquo;{filter.q}&rdquo; 검색 결과 {total}건</>
          ) : hasFilters ? (
            <>조건에 맞는 상품 {total.toLocaleString()}개</>
          ) : (
            <>일반 판매 상품 {total.toLocaleString()}개</>
          )}
        </p>
        <div className="sm:hidden">
          <ProductSort
            filter={filter}
            basePath="/products"
            triggerClassName="h-8 w-auto gap-1 rounded-full border-border px-3 text-xs"
          />
        </div>
      </div>
      <ProductGrid
        products={items}
        teams={teams}
        members={members}
        publicBaseUrl={env.R2_PUBLIC_BASE}
        searchQuery={filter.q}
        hasFilters={hasFilters}
        wishedIds={wishedIds}
        viewerAccountId={account?.id ?? null}
      />
      <ProductPagination filter={filter} total={total} basePath="/products" />
    </div>
  );
}
