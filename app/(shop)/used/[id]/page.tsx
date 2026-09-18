import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBack } from "@/components/PageBack";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { formatKstDate } from "@/lib/datetime";
import { getCurrentAccount } from "@/modules/auth/dal";
import Link from "next/link";
import { ArrowUpRight, Store } from "lucide-react";
import {
  getActiveTradeForListing,
  getUsedListingById,
  listSellerListings,
} from "@/modules/used/lib/queries";
import { settleUsedListingIfDue } from "@/modules/used/actions";
import { UsedDetailCta } from "@/modules/used/components/UsedDetailCta";
import { UsedRow } from "@/modules/used/components/UsedRow";
import { getUsedWishlistIds } from "@/modules/used/lib/wishlist";
import { getPointBalance } from "@/modules/points/lib/queries";
import { UsedPhotoGallery } from "@/modules/used/components/UsedPhotoGallery";
import { MessageUserButton } from "@/modules/messages/components/MessageUserButton";
import {
  PRODUCT_CONDITION_BADGE_CLASS,
  PRODUCT_CONDITION_LABEL,
  USED_SHIPPING_LABEL,
  USED_STATUS_LABEL,
} from "@/modules/used/types";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getUsedListingById(Number(id) || 0);
  return { title: listing ? `${listing.title} — 중고거래` : "중고 매물" };
}

export default async function UsedDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) notFound();

  // 경매는 조회 시점 lazy 정산(멱등) 후 최신 상태로.
  await settleUsedListingIfDue(listingId);
  const listing = await getUsedListingById(listingId);
  if (!listing || listing.status === "blocked") notFound();

  const [account, trade, teams, members] = await Promise.all([
    getCurrentAccount(),
    getActiveTradeForListing(listingId),
    listTeams(),
    listMembers(),
  ]);
  const [usedWishedIds, pointBalance] = account
    ? await Promise.all([
        getUsedWishlistIds(account.id),
        getPointBalance(account.id),
      ])
    : [undefined, 0];
  // 이 판매자의 다른 판매중 매물(현재 매물 제외) — 상세 하단·묶음 구매 유도.
  const sellerOther = await listSellerListings(listing.sellerAccountId, {
    excludeId: listingId,
    pageSize: 12,
  });
  const role =
    account === null
      ? ("visitor" as const)
      : listing.sellerAccountId === account.id
        ? ("seller" as const)
        : trade?.buyerAccountId === account.id
          ? ("buyer" as const)
          : ("visitor" as const);
  // 거래 정보는 당사자에게만 — 방문자에게는 상태 배지로만 보인다.
  const visibleTrade = role === "visitor" ? null : trade;

  const team = teams.find((t) => t.id === listing!.teamId);
  const member = members.find((m) => m.id === listing!.memberId);

  return (
    <div className="shop-page-frame space-y-4">
      <PageBack fallbackHref="/used" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <UsedPhotoGallery
          photos={listing.photos.map((p) => ({
            id: p.id,
            url: `${env.R2_PUBLIC_BASE}/${p.r2Key}`,
          }))}
          alt={listing.title}
        />
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {USED_STATUS_LABEL[listing.status]}
              </Badge>
              {(team || member) && (
                <span className="text-xs text-muted-foreground">
                  {team?.name}
                  {member ? ` / ${member.name}` : ""}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {listing.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/used/seller/${listing.sellerAccountId}`}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
              >
                <Store className="h-3.5 w-3.5" />
                {listing.sellerName}
              </Link>{" "}
              · {formatKstDate(listing.createdAt)} 등록
            </p>
            {role !== "seller" && (
              <div className="pt-1">
                <MessageUserButton
                  toAccountId={listing.sellerAccountId}
                  toName={listing.sellerName}
                  isLoggedIn={account !== null}
                  contextLabel={listing.title}
                  variant="outline"
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* 세부정보 — 스토어 상세와 같은 표 형식(컨디션·배송)으로 통일. */}
          <div className="space-y-2 border-y border-border py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">컨디션</span>
              <Badge
                variant="outline"
                className={cn(PRODUCT_CONDITION_BADGE_CLASS[listing.condition])}
              >
                {PRODUCT_CONDITION_LABEL[listing.condition]}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">배송</span>
              <span className="text-foreground">
                {USED_SHIPPING_LABEL[listing.shippingMethod]}
                {listing.shippingFee > 0
                  ? ` · ₩${listing.shippingFee.toLocaleString()}`
                  : " · 배송비 포함"}
              </span>
            </div>
          </div>

          <UsedDetailCta
            listing={listing}
            trade={visibleTrade}
            role={role}
            isLoggedIn={account !== null}
            wished={usedWishedIds?.has(listing.id) ?? false}
            pointBalance={pointBalance}
          />

          {listing.description && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">설명</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {listing.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 이 판매자의 다른 매물 — 함께 사면 배송비 1회(묶음 구매) 유도. */}
      {sellerOther.total > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-foreground">
                이 판매자의 다른 매물
              </h2>
              <p className="text-xs text-muted-foreground">
                함께 구매하면 배송비를 한 번만 내요.
              </p>
            </div>
            <Link
              href={`/used/seller/${listing.sellerAccountId}`}
              className="inline-flex shrink-0 items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
            >
              상점 전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <UsedRow
            listings={sellerOther.items}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={usedWishedIds}
            isLoggedIn={account !== null}
          />
        </section>
      )}
    </div>
  );
}
