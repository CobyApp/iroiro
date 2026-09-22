import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Star, Store } from "lucide-react";
import { env } from "@/lib/env";
import { formatKstDate } from "@/lib/datetime";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  getSellerSummary,
  listSellerListings,
} from "@/modules/used/lib/queries";
import {
  getSellerReviewSummary,
  listSellerReviews,
} from "@/modules/used/lib/review-queries";
import { getUsedWishlistIds } from "@/modules/used/lib/wishlist";
import { getPointBalance } from "@/modules/points/lib/queries";
import { UsedListingCard } from "@/modules/used/components/UsedListingCard";
import { SellerBundleShop } from "@/modules/used/components/SellerBundleShop";

export const metadata: Metadata = { title: "판매자 상점" };

const PAGE_SIZE = 24;

// 판매자 상점 — 이 판매자의 판매중 매물 모음. 상세에서 판매자 클릭 시 진입.
export default async function UsedSellerPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [summary, account] = await Promise.all([
    getSellerSummary(accountId),
    getCurrentAccount(),
  ]);
  if (!summary) notFound();

  const [{ items, total }, wishedIds, pointBalance, reviewSummary, reviews] =
    await Promise.all([
      listSellerListings(accountId, { page, pageSize: PAGE_SIZE }),
      account ? getUsedWishlistIds(account.id) : Promise.resolve(undefined),
      account ? getPointBalance(account.id) : Promise.resolve(0),
      getSellerReviewSummary(accountId),
      listSellerReviews(accountId),
    ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLoggedIn = account !== null;
  const isOwner = account?.id === accountId;
  // 로그인한 다른 회원 + 고정가 판매중 매물 2개 이상이면 묶음 구매 모드.
  const fixedActiveCount = items.filter(
    (l) => l.saleMode === "fixed" && l.status === "active",
  ).length;
  const canBundle = isLoggedIn && !isOwner && fixedActiveCount >= 2;

  return (
    <div className="shop-page-frame space-y-5">

      <header className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Store className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-foreground">
            {summary.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            판매중 {summary.activeCount} · 판매완료 {summary.soldCount}
          </p>
          {reviewSummary.count > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <b>{reviewSummary.avg.toFixed(1)}</b>
              <span className="text-muted-foreground">후기 {reviewSummary.count}</span>
            </p>
          )}
        </div>
      </header>

      {canBundle && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          🧺 여러 개를 골라 <b>함께 구매</b>하면 배송비를 한 번만 내요.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-12 text-center text-muted-foreground">
          판매중인 매물이 없어요.
        </div>
      ) : canBundle ? (
        <SellerBundleShop
          listings={items}
          publicBaseUrl={env.R2_PUBLIC_BASE}
          pointBalance={pointBalance}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
          {items.map((listing) => (
            <UsedListingCard
              key={listing.id}
              listing={listing}
              publicBaseUrl={env.R2_PUBLIC_BASE}
              wished={wishedIds?.has(listing.id) ?? false}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </div>
      )}

      {reviews.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-base font-bold text-foreground">거래 후기</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {reviews.map((r) => (
              <li key={r.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5" aria-label={`별점 ${r.rating}점`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={
                          "h-3.5 w-3.5 " +
                          (r.rating >= n
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30")
                        }
                        aria-hidden
                      />
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.reviewerMasked}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatKstDate(r.createdAt)}
                  </span>
                </div>
                {r.comment && (
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {r.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2 pt-2" aria-label="페이지">
          {page > 1 && (
            <Link
              href={`/used/seller/${accountId}?page=${page - 1}`}
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
              href={`/used/seller/${accountId}?page=${page + 1}`}
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
