import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { env } from "@/lib/env";
import { EmptyState } from "@/components/EmptyState";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductGrid } from "@/modules/products/components/ProductGrid";
import { listWishlistProducts } from "@/modules/wishlist/lib/queries";
import { listUsedWishlistListings } from "@/modules/used/lib/wishlist";
import { UsedListingCard } from "@/modules/used/components/UsedListingCard";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import { WishlistSearch } from "@/modules/wishlist/components/WishlistSearch";

export const metadata: Metadata = { title: "찜" };

// 찜 탭 — 스토어 상품과 중고 매물을 구분된 섹션으로 보여준다. 찜 전용 검색(?q=)으로 목록 안에서 필터.
export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const account = await getCurrentAccount();
  if (!account) {
    return (
      <GuestFeatureGate
        icon={Heart}
        title="마음에 든 상품을 한곳에 모아보세요"
        description="찜 목록 페이지는 누구나 열어볼 수 있어요. 로그인하면 상품의 하트를 눌러 나만의 목록을 기기와 상관없이 이어서 볼 수 있습니다."
        benefits={[
          "관심 상품 빠르게 다시 찾기",
          "판매 상태와 가격 한눈에 확인",
        ]}
      />
    );
  }

  const [allProducts, allUsedListings, teams, members] = await Promise.all([
    listWishlistProducts(account.id),
    listUsedWishlistListings(account.id),
    listTeams(),
    listMembers(),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name.toLowerCase()]));
  const memberName = new Map(members.map((m) => [m.id, m.name.toLowerCase()]));
  // 찜 목록 안에서 이름/그룹/멤버로 필터(스토어로 이동하지 않는다).
  const matches = (
    text: string,
    teamId: number | null,
    memberId: number | null,
  ) =>
    !query ||
    text.toLowerCase().includes(query) ||
    (teamId !== null && (teamName.get(teamId) ?? "").includes(query)) ||
    (memberId !== null && (memberName.get(memberId) ?? "").includes(query));

  const products = allProducts.filter((p) =>
    matches(p.name, p.teamId, p.memberId),
  );
  const usedListings = allUsedListings.filter((l) =>
    matches(l.title, l.teamId, l.memberId),
  );
  const wishedIds = new Set(products.map((p) => String(p.id)));
  const hasAny = allProducts.length > 0 || allUsedListings.length > 0;
  const noResult = hasAny && products.length === 0 && usedListings.length === 0;

  return (
    <div className="shop-page-frame space-y-6">
      <h1 className="font-display text-2xl">찜</h1>
      {hasAny && <WishlistSearch initialQuery={q ?? ""} />}
      {!hasAny ? (
        <EmptyState
          emoji="🤍"
          title="찜한 상품이 없어요"
          description="상품에서 하트를 눌러 담아보세요"
          action={{ href: "/products", label: "상품 둘러보기" }}
        />
      ) : noResult ? (
        <EmptyState
          emoji="🔍"
          title="검색 결과가 없어요"
          description={`"${q}" 와 일치하는 찜이 없어요`}
        />
      ) : (
        <>
          {products.length > 0 && (
            <section className="space-y-3" data-page-section>
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-foreground">스토어</h2>
                <span className="text-sm text-muted-foreground">
                  {products.length}개
                </span>
              </div>
              <ProductGrid
                products={products}
                teams={teams}
                members={members}
                publicBaseUrl={env.R2_PUBLIC_BASE}
                hasFilters={false}
                wishedIds={wishedIds}
              />
            </section>
          )}
          {usedListings.length > 0 && (
            <section className="space-y-3" data-page-section>
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-bold text-foreground">
                  중고거래
                </h2>
                <span className="text-sm text-muted-foreground">
                  {usedListings.length}개
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
                {usedListings.map((listing) => (
                  <UsedListingCard
                    key={listing.id}
                    listing={listing}
                    publicBaseUrl={env.R2_PUBLIC_BASE}
                    wished
                    isLoggedIn
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
