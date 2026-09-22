import { describe, expect, it } from "vitest";
import { buildDraftProductFromCard } from "@/modules/products/lib/build-draft-from-card";
import { productCreateSchema } from "@/modules/products/lib/schema";

const card = {
  id: 42,
  itemCode: "CS-0119-01",
  itemType: "photocard",
  teamId: 3,
  memberId: 7,
  seriesId: 11,
  name: "増田 ver.1",
  retailPriceJpy: 800,
};

describe("buildDraftProductFromCard", () => {
  it("정가×환율로 판매가를 제안하고 정가=판매가로 초안을 만든다", () => {
    // 100¥당 950원 → 800¥ ≈ 7,600원, 500원 단위 반올림 = 7,500원
    const draft = buildDraftProductFromCard(card, {
      rate100: 950,
      useRateForSalePrice: true,
      photoR2Key: "products/x.jpg",
      today: "2026-09-22",
    });
    expect(draft.salePrice).toBe(7500);
    expect(draft.regularPrice).toBe(7500);
    expect(draft.salePrice).toBeLessThanOrEqual(draft.regularPrice);
    expect(draft.saleStatus).toBe("draft");
    expect(draft.stockQuantity).toBe(0);
    expect(draft.catalogCardId).toBe(42);
    expect(draft.seriesId).toBe(11);
    expect(draft.photos).toHaveLength(1);
    expect(draft.photos[0].isThumbnail).toBe(true);
  });

  it("환율 미사용이면 가격 0(미정)으로 둔다", () => {
    const draft = buildDraftProductFromCard(card, {
      rate100: 950,
      useRateForSalePrice: false,
      photoR2Key: "products/x.jpg",
      today: "2026-09-22",
    });
    expect(draft.salePrice).toBe(0);
    expect(draft.regularPrice).toBe(0);
  });

  it("결과가 productCreateSchema 를 통과한다", () => {
    const draft = buildDraftProductFromCard(card, {
      rate100: 950,
      useRateForSalePrice: true,
      photoR2Key: "products/x.jpg",
      today: "2026-09-22",
    });
    expect(() => productCreateSchema.parse(draft)).not.toThrow();
  });

  it("환율이 0이어도 매입환율은 양수(스키마 요구)를 보장한다", () => {
    const draft = buildDraftProductFromCard(card, {
      rate100: 0,
      useRateForSalePrice: true,
      photoR2Key: "products/x.jpg",
      today: "2026-09-22",
    });
    expect(draft.purchaseExchangeRate).toBeGreaterThan(0);
    expect(draft.salePrice).toBe(0);
    expect(() => productCreateSchema.parse(draft)).not.toThrow();
  });
});
