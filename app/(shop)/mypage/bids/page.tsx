import type { Metadata } from "next";
import Link from "next/link";
import { Gavel } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentAccount } from "@/modules/auth/dal";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import {
  activeBidSummaries,
  listMyBidSummaries,
  MY_BID_STATUS_LABEL,
  type MyBidStatus,
} from "@/modules/auction/lib/my-bids";
import { settleDueAuctions } from "@/modules/auction/lib/settle";
import { remainingLabel } from "@/modules/auction/lib/rules";
import { getProductsByIds } from "@/modules/products/lib/queries";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";
import { ProductImage } from "@/modules/products/components/ProductImage";

export const metadata: Metadata = { title: "입찰 내역" };

const STATUS_BADGE: Record<MyBidStatus, string> = {
  winning: "border-primary/40 bg-primary/10 text-primary",
  outbid: "border-amber-400/50 bg-amber-100/60 text-amber-700",
  awarded_unpaid: "border-primary bg-primary text-primary-foreground",
  purchased: "border-border bg-muted text-muted-foreground",
  lost: "border-border bg-muted text-muted-foreground",
  expired: "border-destructive/40 bg-destructive/10 text-destructive",
  passed: "border-border bg-muted text-muted-foreground",
};

export default async function MyBidsPage() {
  const account = await getCurrentAccount();
  if (!account) {
    return (
      <GuestFeatureGate
        icon={Gavel}
        title="내 입찰 현황을 한눈에"
        description="입찰한 상품의 최고가 여부, 낙찰·결제 대기 상태를 모아 보여드려요."
        benefits={["실시간 최고가/추월 상태 확인", "낙찰 시 결제 기한 안내"]}
        secondaryHref="/products"
        secondaryLabel="상품 둘러보기"
      />
    );
  }

  // 마감 지난 경매를 먼저 정산해 상태가 항상 최신이 되게 한다.
  await settleDueAuctions();
  const summaries = await listMyBidSummaries(account.id);
  const products = await getProductsByIds(summaries.map((s) => s.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const now = new Date();

  return (
    <div className="shop-page-frame mx-auto max-w-2xl space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">입찰 내역</h1>
        <span className="text-sm text-muted-foreground">
          진행중 {activeBidSummaries(summaries).length}건
        </span>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-10 text-center shadow-card">
          <Gavel className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-semibold text-foreground">아직 입찰한 상품이 없어요</p>
          <p className="mt-1 text-sm text-muted-foreground">
            진행중인 경매에서 원하는 카드에 입찰해 보세요.
          </p>
          <Button asChild className="mt-5">
            <Link href="/products">경매 보러가기</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {summaries.map((s) => {
            const product = productById.get(s.productId);
            if (!product) return null;
            const isActionable =
              s.status === "awarded_unpaid" ||
              s.status === "winning" ||
              s.status === "outbid";
            return (
              <li key={s.productId}>
                <Link
                  href={`/products/${s.productId}`}
                  className={cn(
                    "flex gap-3 rounded-md border border-border bg-card p-3 shadow-card transition-transform hover:-translate-y-0.5",
                    s.status === "awarded_unpaid" && "border-primary/60 bg-primary/5",
                  )}
                >
                  <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-sm border border-border bg-lilac">
                    <ProductImage
                      src={productGridThumbnailUrl(s.productId)}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn("font-normal", STATUS_BADGE[s.status])}
                      >
                        {MY_BID_STATUS_LABEL[s.status]}
                      </Badge>
                      {s.status === "winning" && s.endsAt && (
                        <span className="text-[11px] text-muted-foreground">
                          {remainingLabel(s.endsAt, now)} 남음
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">
                      {product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      내 입찰 ₩{s.myMaxBid.toLocaleString()}
                      {s.currentPrice !== null && (
                        <>
                          {" "}· {s.status === "awarded_unpaid" || s.status === "purchased"
                            ? "낙찰가"
                            : "현재가"}{" "}
                          <b
                            className={cn(
                              s.status === "outbid"
                                ? "text-amber-600"
                                : "text-foreground",
                            )}
                          >
                            ₩{s.currentPrice.toLocaleString()}
                          </b>
                        </>
                      )}
                    </p>
                    {s.status === "awarded_unpaid" && s.payDueAt && (
                      <p className="text-xs font-medium text-primary">
                        결제 기한 {remainingLabel(s.payDueAt, now)} 남음 — 지나면
                        낙찰이 취소돼요
                      </p>
                    )}
                    {s.status === "expired" && (
                      <p className="text-xs text-muted-foreground">
                        기한 내 결제되지 않아 낙찰이 취소됐어요
                      </p>
                    )}
                  </div>
                  {isActionable && (
                    <span className="self-center">
                      <span
                        className={cn(
                          "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold",
                          s.status === "awarded_unpaid"
                            ? "bg-primary text-primary-foreground"
                            : "border border-border text-foreground",
                        )}
                      >
                        {s.status === "awarded_unpaid"
                          ? "결제하기"
                          : s.status === "outbid"
                            ? "재입찰"
                            : "보기"}
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* 미결제 불이익 가이드 — 입찰 문화 안내 */}
      <div className="rounded-md border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">입찰 이용 안내</p>
        입찰은 낙찰 시 구매를 약속하는 행동으로, 제출 후 취소할 수 없어요. 낙찰
        후 <b className="text-foreground">48시간 내 결제하지 않으면 낙찰이 취소</b>
        되며, 미결제가 반복되면 입찰 이용이 제한될 수 있어요.
      </div>
    </div>
  );
}
