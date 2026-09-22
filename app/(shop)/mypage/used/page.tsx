import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { formatKstDate } from "@/lib/datetime";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  autoConfirmDueUsedTrades,
  AUTO_CONFIRM_MS,
} from "@/modules/used/lib/settle-trade";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import { UserRound } from "lucide-react";
import {
  listMyUsedListings,
  listMyUsedPurchases,
  listUsedListingsByIds,
} from "@/modules/used/lib/queries";
import { reviewedTradeIdsOf } from "@/modules/used/lib/review-queries";
import { UsedReviewDialog } from "@/modules/used/components/UsedReviewDialog";
import { UsedRow } from "@/modules/used/components/UsedRow";
import { getUsedWishlistIds } from "@/modules/used/lib/wishlist";
import { USED_TRADE_STATUS_LABEL } from "@/modules/used/types";

export const metadata: Metadata = { title: "내 중고거래" };

// 마이 탭 — 내가 판(등록) 매물과 산(거래) 내역을 한곳에서. 안전거래 상태를 함께 보여준다.
export default async function MyUsedTradesPage() {
  const account = await getCurrentAccount().catch(() => null);
  if (!account) {
    return (
      <div className="shop-page-frame space-y-6">
        <ShopPageHeader title="내 중고거래" />
        <GuestFeatureGate
          icon={UserRound}
          title="내 중고거래 내역을 확인하려면 로그인하세요"
          description="판매·구매한 중고 매물과 거래 상태를 한곳에서 볼 수 있어요."
          benefits={["판매 등록 매물 관리", "구매·거래 상태 확인"]}
        />
      </div>
    );
  }

  // 진입 시 기한 지난 발송 건을 자동 수령확정(lazy 스윕) — cron 이 없어도 확정이 진행된다.
  await autoConfirmDueUsedTrades();

  const [sales, purchases, wishedIds] = await Promise.all([
    listMyUsedListings(account.id),
    listMyUsedPurchases(account.id),
    getUsedWishlistIds(account.id),
  ]);
  const purchaseListings = await listUsedListingsByIds(
    purchases.map((t) => t.listingId),
  );
  const listingById = new Map(purchaseListings.map((l) => [l.id, l]));
  // 완료된 거래 중 이미 후기를 남긴 것 — '후기 남기기' 노출 판단.
  const reviewedTradeIds = await reviewedTradeIdsOf(
    account.id,
    purchases.filter((t) => t.status === "completed").map((t) => t.id),
  );

  return (
    <div className="shop-page-frame space-y-8">
      <ShopPageHeader title="내 중고거래" />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">
          판매 내역 <span className="text-sm text-muted-foreground">{sales.length}</span>
        </h2>
        {sales.length > 0 ? (
          <UsedRow listings={sales} publicBaseUrl={env.R2_PUBLIC_BASE} wishedIds={wishedIds} isLoggedIn />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
            아직 판매 등록한 매물이 없어요.{" "}
            <Link href="/used/new" className="font-medium text-primary underline-offset-2 hover:underline">
              판매하기
            </Link>
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">
          구매 내역 <span className="text-sm text-muted-foreground">{purchases.length}</span>
        </h2>
        {purchases.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {purchases.map((trade) => {
              const listing = listingById.get(trade.listingId);
              const thumb = listing?.photos.find((p) => p.isPrimary) ?? listing?.photos[0];
              return (
                <li key={trade.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Link
                    href={`/used/${trade.listingId}`}
                    className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded border border-border bg-muted">
                      {thumb && (
                        /* eslint-disable-next-line @next/next/no-img-element -- 목록 썸네일 */
                        <img
                          src={`${env.R2_PUBLIC_BASE}/${thumb.r2Key}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {listing?.title ?? "매물"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ₩{trade.price.toLocaleString()} · {USED_TRADE_STATUS_LABEL[trade.status]}
                      </span>
                      {trade.status === "shipped" && trade.shippedAt && (
                        <span className="block text-[11px] text-muted-foreground">
                          {formatKstDate(
                            new Date(
                              new Date(trade.shippedAt).getTime() + AUTO_CONFIRM_MS,
                            ),
                          )}{" "}
                          자동 구매확정
                        </span>
                      )}
                    </span>
                  </Link>
                  {trade.status === "completed" &&
                    (reviewedTradeIds.has(trade.id) ? (
                      <span className="shrink-0 text-xs text-muted-foreground">후기 완료</span>
                    ) : (
                      <UsedReviewDialog tradeId={trade.id} />
                    ))}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
            아직 구매한 중고 매물이 없어요.
          </p>
        )}
      </section>
    </div>
  );
}
