import { jpyToKrwPrice } from "./fx";
import type { ProductCreateInput } from "./schema";
import { ITEM_TYPES, type ItemType } from "../types";

// A catalog card, reduced to what a draft product needs. Kept structural so this stays pure/testable.
export type DraftCardInput = {
  id: number;
  itemCode: string | null;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  seriesId: number | null;
  name: string;
  retailPriceJpy: number;
};

export type BuildDraftOptions = {
  /** KRW per 100 JPY (fetchJpyKrwRate.rate). 0 이면 판매가 제안을 못 한다. */
  rate100: number;
  /** true 면 정가×환율로 판매가를 제안, false 면 0(가격 미정). */
  useRateForSalePrice: boolean;
  /** 카드 앞면을 상품 버킷으로 복사한 R2 키 — 상품 사진 1장이 된다. */
  photoR2Key: string;
};

// 카탈로그 카드 → 초안 상품 입력. saleStatus=draft, 재고 0으로 두고 가격만 정가×환율로 제안한다
// (관리자가 나중에 가격·재고를 채우고 공개). regularPrice=salePrice 로 DB CHECK(salePrice<=regularPrice)를 만족.
export function buildDraftProductFromCard(
  card: DraftCardInput,
  opts: BuildDraftOptions,
): ProductCreateInput {
  const suggested = opts.useRateForSalePrice
    ? jpyToKrwPrice(card.retailPriceJpy, opts.rate100)
    : 0;
  const itemType: ItemType = (ITEM_TYPES as readonly string[]).includes(card.itemType)
    ? (card.itemType as ItemType)
    : ITEM_TYPES[0];
  return {
    saleMode: "fixed",
    auctionStartPrice: null,
    auctionEndsAt: null,
    itemCode: card.itemCode && card.itemCode.trim() !== "" ? card.itemCode.trim() : null,
    itemType,
    teamId: card.teamId ?? null,
    memberId: card.memberId ?? null,
    seriesId: card.seriesId ?? null,
    catalogCardId: card.id,
    name: card.name,
    regularPrice: suggested,
    salePrice: suggested,
    stockQuantity: 0,
    saleStatus: "draft",
    retailPriceJpy: card.retailPriceJpy > 0 ? card.retailPriceJpy : 0,
    photos: [
      { r2Key: opts.photoR2Key, altText: null, displayOrder: 0, isThumbnail: true },
    ],
  };
}
