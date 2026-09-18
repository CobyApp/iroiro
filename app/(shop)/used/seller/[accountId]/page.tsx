import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Store } from "lucide-react";
import { env } from "@/lib/env";
import { PageBack } from "@/components/PageBack";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  getSellerSummary,
  listSellerListings,
} from "@/modules/used/lib/queries";
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

  const [{ items, total }, wishedIds, pointBalance] = await Promise.all([
    listSellerListings(accountId, { page, pageSize: PAGE_SIZE }),
    account ? getUsedWishlistIds(account.id) : Promise.resolve(undefined),
    account ? getPointBalance(account.id) : Promise.resolve(0),
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
      <PageBack fallbackHref="/used" />

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
