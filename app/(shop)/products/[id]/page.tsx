import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductDetail } from "@/modules/products/components/ProductDetail";
import { WishlistButton } from "@/modules/products/components/WishlistButton";
import { AddToCartButton } from "@/modules/cart/components/AddToCartButton";
import { AuctionPanel } from "@/modules/auction/components/AuctionPanel";
import {
  listRecentBids,
  listRecentTradePrices,
} from "@/modules/auction/lib/queries";
import { settleProductIfDue } from "@/modules/auction/lib/settle";
import {
  getProductById,
  listRelatedProducts,
} from "@/modules/products/lib/queries";
import { RecentPriceInfo } from "@/modules/products/components/RecentPriceInfo";
import { ProductRow } from "@/modules/products/components/ProductRow";
import { fetchJpyKrwRate, jpyToKrwPrice } from "@/modules/products/lib/fx";
import { todayKstYmd } from "@/lib/datetime";
import { productDetailPhotoSrc } from "@/modules/products/lib/customer-media";
import { getWishlistProductIds } from "@/modules/wishlist/lib/queries";
import { ProductReviewsSection } from "@/modules/reviews/components/ProductReviewsSection";

type Params = Promise<{ id: string }>;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const productId = parseId(id);
  if (productId === null) return { title: "상품을 찾을 수 없습니다" };

  const product = await getProductById(productId);

  if (!product) {
    return { title: "상품을 찾을 수 없습니다" };
  }

  return {
    title: product.name,
    description: product.description ?? undefined,
    openGraph: {
      title: product.name,
      description: product.description ?? undefined,
      images: product.photos.length
        ? [productDetailPhotoSrc(product.photos[0])]
        : [],
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { id } = await params;
  const productId = parseId(id);
  if (productId === null) notFound();

  let product = await getProductById(productId);
  if (!product) notFound();

  // 경매 상품은 조회 시점에 마감·결제기한을 lazy 정산(멱등) 후 최신 상태로 렌더.
  if (product.saleMode === "auction") {
    const settled = await settleProductIfDue(BigInt(productId));
    if (settled) {
      product = (await getProductById(productId)) ?? product;
    }
  }

  const [teams, members, account] = await Promise.all([
    listTeams(),
    listMembers(),
    getCurrentAccount(),
  ]);
  const team =
    product.teamId !== null
      ? teams.find((item) => item.id === product.teamId)
      : undefined;
  const member =
    product.memberId !== null
      ? members.find((item) => item.id === product.memberId)
      : undefined;
  const wishedIds = account
    ? await getWishlistProductIds(account.id)
    : undefined;

  const isAuction =
    product.saleMode === "auction" && product.auctionStatus !== null;
  // 최근 거래가는 정가 판매에도 참고 정보로 보여준다(같은 카드 기준).
  // 스토어 상품은 카드별로 겹치지 않아 "이 카드의 다른 매물" 섹션은 두지 않는다. 연관 추천만 로드.
  const [bids, recentTrades, related, fxRate] = await Promise.all([
    isAuction ? listRecentBids(product.id, account?.id ?? null, 50) : [],
    listRecentTradePrices({
      id: product.id,
      catalogCardId: product.catalogCardId,
      itemCode: product.itemCode,
      name: product.name,
    }),
    listRelatedProducts(product, 8),
    product.marketAvgJpy > 0
      ? fetchJpyKrwRate(todayKstYmd())
          .then((r) => r.rate)
          .catch(() => 0)
      : 0,
  ]);
  const marketAvgKrw =
    product.marketAvgJpy > 0 && fxRate > 0
      ? jpyToKrwPrice(product.marketAvgJpy, fxRate)
      : 0;

  const cta = isAuction ? (
    <div className="space-y-3">
      {/* 경매도 찜 가능 — 입찰 줄 왼쪽, 고정가의 leadingAction과 같은 자리. */}
      <AuctionPanel
        wishlistSlot={
          <WishlistButton
            productId={String(product.id)}
            initialWished={wishedIds?.has(String(product.id)) ?? false}
            isLoggedIn={account !== null}
            variant="detail"
            className="h-10 px-3.5"
          />
        }
        productId={product.id}
        startPrice={product.auctionStartPrice ?? product.salePrice}
        currentPrice={product.auctionCurrentPrice}
        bidCount={product.auctionBidCount}
        endsAt={product.auctionEndsAt ?? new Date(0).toISOString()}
        status={product.auctionStatus!}
        isWinner={
          account !== null && product.auctionWinnerAccountId === account.id
        }
        payDueAt={product.auctionPayDueAt}
        isSold={product.stockQuantity === 0}
        isLoggedIn={account !== null}
        bids={bids}
        recentTrades={recentTrades}
      />
    </div>
  ) : (
    <AddToCartButton
      productId={product.id}
      stockQuantity={product.stockQuantity}
      isLoggedIn={account !== null}
      leadingAction={
        <WishlistButton
          productId={String(product.id)}
          initialWished={wishedIds?.has(String(product.id)) ?? false}
          isLoggedIn={account !== null}
          variant="detail"
        />
      }
    />
  );

  return (
    <div className="shop-page-frame space-y-4">
      <ProductDetail
        product={product}
        team={team}
        member={member}
        publicBaseUrl={env.R2_PUBLIC_BASE}
        cta={cta}
      />
      <div className="space-y-4 lg:ml-[calc(420px+2rem)]">
        <RecentPriceInfo
          trades={recentTrades}
          marketAvgKrw={marketAvgKrw}
          marketSoldCount={product.marketSoldCount}
        />
      </div>
      <ProductReviewsSection
        productId={product.id}
        viewerAccountId={account?.id ?? null}
      />
      {related.length > 0 && (
        <section className="pt-2">
          <h2 className="text-lg font-semibold text-foreground">
            이런 카드는 어때요
          </h2>
          <ProductRow
            products={related}
            teams={teams}
            members={members}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={wishedIds}
            viewerAccountId={account?.id ?? null}
          />
        </section>
      )}
    </div>
  );
}
