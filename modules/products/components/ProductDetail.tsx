import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { Team } from "@/modules/teams/types";
import type { Member } from "@/modules/members/types";
import { formatKstDate } from "@/lib/datetime";
import { ProductGallery } from "./ProductGallery";
import { productDetailPhotoSrc } from "../lib/customer-media";
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
  // 구매 CTA는 cart 도메인 소관 — 페이지가 주입한다(도메인 합성은 호출 측에서).
  cta: ReactNode;
};

export function ProductDetail({
  product,
  team,
  member,
  cta,
}: Props) {
  const isAuction = product.saleMode === "auction";
  const finalPrice = product.salePrice;
  const hasDiscount = product.salePrice < product.regularPrice;
  const isSoldOut = product.stockQuantity === 0;
  const isLastOne = product.stockQuantity === 1;
  const memberJa = member?.nameI18n?.["ja-jpan"];

  // 대표 이미지 상태 처리 — 품절/판매완료/유찰이면 흐리게 + 라벨(리스트 카드와 일관).
  const auctionLive = isAuction && product.auctionStatus === "live";
  const auctionEnded = isAuction && !auctionLive && product.auctionStatus !== null;
  const galleryUnavailable = isAuction ? auctionEnded : isSoldOut;
  const galleryStatusLabel = isAuction
    ? product.auctionStatus === "awarded"
      ? "판매완료"
      : product.auctionStatus === "passed"
        ? "유찰"
        : undefined
    : isSoldOut
      ? "품절"
      : undefined;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <ProductGallery
          photos={product.photos.map((photo) => ({
            id: photo.id,
            altText: photo.altText,
            url: productDetailPhotoSrc(photo),
          }))}
          altFallback={product.name}
          unavailable={galleryUnavailable}
          statusLabel={galleryStatusLabel}
        />
      </div>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {team?.name ?? "-"}
            {member && (
              <span>
                {" / "}
                {member.name}
                {memberJa ? ` (${memberJa})` : ""}
              </span>
            )}
          </p>
          <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
        </div>
        {/* 경매 상품은 가격·상태를 입찰 패널(cta)이 전담한다. */}
        {!isAuction && (
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-foreground">
              ₩{finalPrice.toLocaleString()}
            </span>
            {hasDiscount && (
              <span className="text-base text-muted-foreground line-through">
                ₩{product.regularPrice.toLocaleString()}
              </span>
            )}
          </div>
        )}
        {!isAuction && isSoldOut && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            아쉽게도 품절된 상품이에요
          </p>
        )}
        {!isAuction && isLastOne && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <AlertTriangle className="h-4 w-4" />
            마지막 1개 남았어요
          </p>
        )}
        <div
          className={
            // 경매에서 표시할 행이 하나도 없으면 빈 테두리 박스가 남지 않게 숨긴다.
            isAuction && ITEM_TYPES.length <= 1
              ? "hidden"
              : "space-y-2 border-y border-border py-4 text-sm"
          }
        >
          <div className={isAuction ? "hidden" : "flex justify-between"}>
            <span className="text-muted-foreground">재고</span>
            <span className="font-medium text-foreground">
              {isSoldOut ? "품절" : `${product.stockQuantity}개`}
            </span>
          </div>
          {ITEM_TYPES.length > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">유형</span>
              <span className="text-foreground">
                {ITEM_TYPE_LABEL[product.itemType]}
              </span>
            </div>
          )}
          {/* 컨디션 행 제거 — 스토어 판매품은 상태 미노출(중고거래만 표시). */}
        </div>
        {cta}
        {product.description && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">설명</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {product.description}
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          등록일: {formatKstDate(product.createdAt)}
        </p>
      </div>
    </div>
  );
}
