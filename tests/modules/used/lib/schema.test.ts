import { describe, expect, it } from "vitest";
import { usedListingCreateSchema } from "@/modules/used/lib/schema";

const photos = [{ r2Key: "used/original/a.jpg", displayOrder: 0, isPrimary: true }];

const base = {
  cardId: 1,
  condition: "good" as const,
  saleMode: "fixed" as const,
  price: 12000,
  shippingMethod: "post" as const,
  shippingFee: 500,
  photos,
};

describe("usedListingCreateSchema", () => {
  it("고정가 매물 — price 필수", () => {
    expect(usedListingCreateSchema.safeParse(base).success).toBe(true);
    expect(
      usedListingCreateSchema.safeParse({ ...base, price: null }).success,
    ).toBe(false);
  });

  it("카드 선택 필수 — cardId 없으면 거부", () => {
    const { cardId: _cardId, ...noCard } = base;
    expect(usedListingCreateSchema.safeParse(noCard).success).toBe(false);
  });

  it("경매 매물 — 시작가·마감시각 필수", () => {
    const auction = {
      ...base,
      saleMode: "auction" as const,
      price: null,
      auctionStartPrice: 5000,
      auctionEndsAt: "2026-09-01T12:00:00+09:00",
    };
    expect(usedListingCreateSchema.safeParse(auction).success).toBe(true);
    expect(
      usedListingCreateSchema.safeParse({ ...auction, auctionEndsAt: null })
        .success,
    ).toBe(false);
  });

  it("대표 사진은 정확히 1장", () => {
    const two = [
      { r2Key: "a", displayOrder: 0, isPrimary: true },
      { r2Key: "b", displayOrder: 1, isPrimary: true },
    ];
    expect(
      usedListingCreateSchema.safeParse({ ...base, photos: two }).success,
    ).toBe(false);
    expect(
      usedListingCreateSchema.safeParse({ ...base, photos: [] }).success,
    ).toBe(false);
  });
});
