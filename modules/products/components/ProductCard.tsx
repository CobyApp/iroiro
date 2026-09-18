import Link from "next/link";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Team } from "@/modules/teams/types";
import type { Member } from "@/modules/members/types";
import { ProductImage } from "./ProductImage";
import { WishlistButton } from "./WishlistButton";
import { productGridPhotoUrl } from "../lib/customer-media";
import { remainingLabel } from "@/modules/auction/lib/rules";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  type ProductWithPhotos,
} from "../types";

type Props = {
  product: ProductWithPhotos;
  team?: Team;
  member?: Member;
  publicBaseUrl: string;
  wished?: boolean;
  isLoggedIn?: boolean;
  /** 보는 사람의 계정 id — 낙찰 뱃지를 "내 낙찰"로 구분하기 위해. */
  viewerAccountId?: string | null;
};

export function ProductCard({
  product,
  team,
  member,
  wished = false,
  isLoggedIn = false,
  viewerAccountId = null,
}: Props) {
  const thumbnail =
    product.photos.find((photo) => photo.isThumbnail) ?? product.photos[0];
  const isSoldOut = product.stockQuantity === 0;
  const finalPrice = product.salePrice;
  const hasDiscount = product.salePrice < product.regularPrice;
  const discountPct = hasDiscount
    ? Math.round((1 - product.salePrice / product.regularPrice) * 100)
    : 0;
  const memberJa = member?.nameI18n?.["ja-jpan"];

  // 경매 카드 — 진행중이면 현재가·마감, 종료면 낙찰/유찰 표시.
  const isAuction = product.saleMode === "auction";
  const auctionLive = isAuction && product.auctionStatus === "live";
  const auctionEnded = isAuction && !auctionLive && product.auctionStatus !== null;
  // 내가 낙찰받은 카드만 강조 — 남의 낙찰은 품절과 같은 톤으로 가라앉힌다.
  const isMyAward =
    product.auctionStatus === "awarded" &&
    viewerAccountId !== null &&
    product.auctionWinnerAccountId === viewerAccountId;
  const auctionEndsLabel =
    auctionLive && product.auctionEndsAt
      ? remainingLabel(product.auctionEndsAt, new Date())
      : null;
  const dimmed = isSoldOut || (auctionEnded && !isMyAward);

  return (
    <Link href={`/products/${product.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-border bg-lilac shadow-card transition-[transform,border-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/40 group-active:translate-y-0 group-active:scale-[.985]">
        {isAuction ? (
          auctionLive || isMyAward ? (
            <Badge className="absolute left-2 top-2 z-10">
              {auctionLive ? "입찰" : "내 낙찰"}
            </Badge>
          ) : (
            auctionEnded && (
              <Badge
                variant="outline"
                className="absolute left-2 top-2 z-10 bg-card text-muted-foreground"
              >
                {product.auctionStatus === "awarded" ? "낙찰 완료" : "유찰"}
              </Badge>
            )
          )
        ) : (
          isSoldOut && (
            <Badge
              variant="outline"
              className="absolute left-2 top-2 z-10 bg-card"
            >
              품절
            </Badge>
          )
        )}
        {hasDiscount && !isSoldOut && !isAuction && (
          <Badge className="absolute bottom-2 left-2 z-10">
            -{discountPct}%
          </Badge>
        )}
        <WishlistButton
          productId={String(product.id)}
          initialWished={wished}
          isLoggedIn={isLoggedIn}
        />
        {thumbnail ? (
          <ProductImage
            src={productGridPhotoUrl(thumbnail.id)}
            alt={thumbnail.altText ?? product.name}
            className={cn(
              "h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-105",
              dimmed && "opacity-50",
            )}
            fallbackClassName={cn(dimmed && "opacity-50")}
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>
      {/* 텍스트 영역 — 제목 2줄·가격 2줄 높이를 항상 확보해 경매/일반이 섞여도
         카드 높이가 들쭉날쭉하지 않게 한다. */}
      <div className="mt-2.5 space-y-1 px-0.5">
        <p className="truncate text-xs text-muted-foreground">
          {team?.name ?? "-"}
          {member && (
            <span>
              {" / "}
              {member.name}
              {memberJa ? ` (${memberJa})` : ""}
            </span>
          )}
        </p>
        <p className="line-clamp-2 min-h-10 text-sm font-semibold text-foreground">
          {product.name}
        </p>
        {isAuction ? (
          <div className="min-h-[42px] space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {product.auctionCurrentPrice === null ? "시작가" : "현재가"}
              </span>
              <span className="text-base font-semibold text-primary">
                ₩
                {(
                  product.auctionCurrentPrice ??
                  product.auctionStartPrice ??
                  finalPrice
                ).toLocaleString()}
              </span>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>입찰 {product.auctionBidCount}</span>
              {auctionEndsLabel && (
                <>
                  <span aria-hidden>·</span>
                  <Clock className="h-3 w-3" aria-hidden />
                  <span>
                    {auctionEndsLabel === "마감" ? "마감" : `${auctionEndsLabel} 남음`}
                  </span>
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="flex min-h-[42px] flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-primary">
              ₩{finalPrice.toLocaleString()}
            </span>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                ₩{product.regularPrice.toLocaleString()}
              </span>
            )}
          </div>
        )}
        {/* 스토어 판매품은 상태(컨디션) 미노출 — 사실상 새 상품이라 노이즈.
           (중고거래 카드만 컨디션 배지를 보여준다.) */}
        {ITEM_TYPES.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <Badge variant="outline">{ITEM_TYPE_LABEL[product.itemType]}</Badge>
          </div>
        )}
      </div>
    </Link>
  );
}
