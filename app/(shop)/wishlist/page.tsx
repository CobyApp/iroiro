import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductGrid } from "@/modules/products/components/ProductGrid";
import { listWishlistProducts } from "@/modules/wishlist/lib/queries";
import { listUsedWishlistListings } from "@/modules/used/lib/wishlist";
import { UsedListingCard } from "@/modules/used/components/UsedListingCard";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";

export const metadata: Metadata = { title: "찜" };

// 찜 탭 — 스토어 상품과 중고 매물을 구분된 섹션으로 보여준다.
export default async function WishlistPage() {
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

  const [products, usedListings, teams, members] = await Promise.all([
    listWishlistProducts(account.id),
    listUsedWishlistListings(account.id),
    listTeams(),
    listMembers(),
  ]);
  const wishedIds = new Set(products.map((p) => String(p.id)));
  const isEmpty = products.length === 0 && usedListings.length === 0;

  return (
    <div className="shop-page-frame space-y-8">
      <h1 className="font-display text-2xl">찜</h1>
      {isEmpty ? (
        <div className="rounded-md border border-border bg-card p-12 text-center shadow-card">
          <p className="mb-2 text-4xl">🤍</p>
          <p className="font-display text-foreground">찜한 상품이 없어요</p>
          <p className="mt-1 text-sm text-muted-foreground">
            상품에서 하트를 눌러 담아보세요
          </p>
          <Button asChild className="mt-5">
            <Link href="/products">상품 둘러보기</Link>
          </Button>
        </div>
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
