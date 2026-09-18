import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { env } from "@/lib/env";
import { BrandMark, BrandWordmark } from "@/modules/ui/components/BrandMark";
import { getActiveBanners } from "@/modules/banners/lib/queries";
import { BannerSlider } from "@/modules/banners/components/BannerSlider";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { HomeNoticeStrip } from "@/modules/notices/components/HomeNoticeStrip";
import { listProducts } from "@/modules/products/lib/queries";
import { ProductRow } from "@/modules/products/components/ProductRow";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getWishlistProductIds } from "@/modules/wishlist/lib/queries";
import { MyBidsStrip } from "@/modules/auction/components/MyBidsStrip";
import { MyFaveSection } from "@/modules/favorites/components/MyFaveSection";

// 홈 `/` — 관리 가능한 캠페인 배너 + 그룹/신상품/재고 상품 큐레이션.
// 상세 검색·필터는 /products 카탈로그가 담당한다.
export default async function HomePage() {
  const account = await getCurrentAccount();
  const [banners, teams, members, newest, inStock, wishedIds] =
    await Promise.all([
      getActiveBanners(),
      listTeams(),
      listMembers(),
      listProducts({
        saleStatus: "active",
        sort: "newest",
        page: 1,
        pageSize: 10,
        deprioritizeUnavailable: true,
      }),
      listProducts({
        saleStatus: "active",
        stock: "in_stock",
        sort: "stock_desc",
        page: 1,
        pageSize: 10,
      }),
      account ? getWishlistProductIds(account.id) : Promise.resolve(undefined),
    ]);

  return (
    <div className="shop-page-frame space-y-10">
      <Suspense fallback={null}>
        <HomeNoticeStrip />
      </Suspense>

      <section className="kawaii-banner-frame" data-page-section>
        {banners.length > 0 ? (
          <BannerSlider banners={banners} publicBase={env.R2_PUBLIC_BASE} />
        ) : (
          <section className="kawaii-default-banner">
            <BrandMark className="mb-3 h-14 w-14 sm:h-16 sm:w-16" preload />
            <BrandWordmark className="h-9 w-auto sm:h-10" preload />
            <h1 className="sr-only">이로이로</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              일본 아이돌 토레카·굿즈
            </p>
          </section>
        )}
      </section>

      {/* 내 입찰 현황 — 배너 바로 아래, 액션 필요한 입찰(결제 대기·진행중)만. */}
      <Suspense fallback={null}>
        <MyBidsStrip />
      </Suspense>



      {/* 내 최애 픽 — 저장한 최애 기반 맞춤 추천 (비로그인 미노출) */}
      <Suspense fallback={null}>
        <MyFaveSection />
      </Suspense>

      <section className="kawaii-products-section" data-page-section>
        <div className="kawaii-section-heading">
          <div>
            <span>JUST ARRIVED</span>
            <h2>새로 들어왔어요</h2>
          </div>
          <Link href="/products" className="kawaii-more-link">
            전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ProductRow
          products={newest.items}
          teams={teams}
          members={members}
          publicBaseUrl={env.R2_PUBLIC_BASE}
          wishedIds={wishedIds}
          viewerAccountId={account?.id ?? null}
        />
      </section>

      <section className="kawaii-products-section" data-page-section>
        <div className="kawaii-section-heading">
          <div>
            <span>READY TO COLLECT</span>
            <h2>바로 만날 수 있어요</h2>
          </div>
          <Link
            href="/products?stock=in_stock&sort=stock_desc"
            className="kawaii-more-link"
          >
            전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ProductRow
          products={inStock.items}
          teams={teams}
          members={members}
          publicBaseUrl={env.R2_PUBLIC_BASE}
          wishedIds={wishedIds}
          viewerAccountId={account?.id ?? null}
        />
      </section>

      {/* 전체 매물로 가는 대표 동선 — 섹션의 작은 '전체 보기'와 별개로 크게 한 번 더. */}
      <section data-page-section>
        <Link
          href="/products"
          className="group flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-elevated transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] sm:px-7 sm:py-5"
        >
          <span>
            <span className="block font-display text-lg sm:text-xl">
              전체 매물 보러가기
            </span>
            <span className="mt-0.5 block text-xs text-primary-foreground/85 sm:text-sm">
              지금 판매 중인 카드 {newest.total.toLocaleString()}장 — 그룹·멤버로 골라보세요
            </span>
          </span>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 transition-transform group-hover:translate-x-1">
            <ArrowRight className="h-5 w-5" />
          </span>
        </Link>
      </section>
    </div>
  );
}
