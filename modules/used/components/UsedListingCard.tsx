import Link from "next/link";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/modules/products/components/ProductImage";
import { remainingLabel } from "@/modules/auction/lib/rules";
import { UsedWishlistButton } from "./UsedWishlistButton";
import {
  PRODUCT_CONDITION_BADGE_CLASS,
  PRODUCT_CONDITION_LABEL,
  USED_STATUS_LABEL,
  type UsedListingWithPhotos,
} from "../types";

// 중고 매물 카드 — 유저가 올린 실물 사진(대표)을 보여준다.
export function UsedListingCard({
  listing,
  publicBaseUrl,
  wished = false,
  isLoggedIn = false,
}: {
  listing: UsedListingWithPhotos;
  publicBaseUrl: string;
  wished?: boolean;
  isLoggedIn?: boolean;
}) {
  const primary =
    listing.photos.find((p) => p.isPrimary) ?? listing.photos[0];
  const isAuction = listing.saleMode === "auction";
  const auctionLive = isAuction && listing.auctionStatus === "live";
  const endsLabel =
    auctionLive && listing.auctionEndsAt
      ? remainingLabel(listing.auctionEndsAt, new Date())
      : null;
  const reserved = listing.status === "reserved";
  const price = isAuction
    ? (listing.auctionCurrentPrice ?? listing.auctionStartPrice ?? 0)
    : (listing.price ?? 0);

  return (
    <Link href={`/used/${listing.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-border bg-lilac shadow-card transition-[transform,border-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/40 group-active:translate-y-0 group-active:scale-[.985]">
        {auctionLive ? (
          <Badge className="absolute left-2 top-2 z-10">입찰</Badge>
        ) : reserved ? (
          <Badge
            variant="outline"
            className="absolute left-2 top-2 z-10 bg-card text-muted-foreground"
          >
            {USED_STATUS_LABEL.reserved}
          </Badge>
        ) : null}
        <UsedWishlistButton
          listingId={listing.id}
          initialWished={wished}
          isLoggedIn={isLoggedIn}
        />
        {primary ? (
          <ProductImage
            src={`${publicBaseUrl}/${primary.r2Key}`}
            alt={listing.title}
            className={cn(
              "h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-105",
              reserved && "opacity-60",
            )}
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>
      {/* 제목 2줄·가격 2줄 높이를 고정 확보 — 경매/일반 매물이 섞여도 카드 높이 일정. */}
      <div className="mt-2.5 space-y-1 px-0.5">
        <p className="truncate text-xs text-muted-foreground">
          {listing.sellerName}
        </p>
        <p className="line-clamp-2 min-h-10 text-sm font-semibold text-foreground">
          {listing.title}
        </p>
        {isAuction ? (
          <div className="min-h-[42px] space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {listing.auctionCurrentPrice === null ? "시작가" : "현재가"}
              </span>
              <span className="text-base font-semibold text-primary">
                ₩{price.toLocaleString()}
              </span>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>입찰 {listing.auctionBidCount}</span>
              {endsLabel && (
                <>
                  <span aria-hidden>·</span>
                  <Clock className="h-3 w-3" aria-hidden />
                  <span>{endsLabel === "마감" ? "마감" : `${endsLabel} 남음`}</span>
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="min-h-[42px] text-base font-semibold text-primary">
            ₩{price.toLocaleString()}
            {listing.shippingFee > 0 && (
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                +배송 {listing.shippingFee.toLocaleString()}
              </span>
            )}
          </p>
        )}
        <Badge
          variant="outline"
          className={cn(PRODUCT_CONDITION_BADGE_CLASS[listing.condition])}
        >
          {PRODUCT_CONDITION_LABEL[listing.condition]}
        </Badge>
      </div>
    </Link>
  );
}
