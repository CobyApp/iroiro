import { describe, expect, it } from "vitest";
import type {
  Product as PrismaProduct,
  ProductPhoto as PrismaProductPhoto,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { toProduct, toProductPhoto } from "@/modules/products/lib/transform";

const productRow: PrismaProduct = {
  id: 100n,
  itemCode: "TRCD-NJZ-001",
  itemType: "photocard",
  teamId: 5n,
  memberId: 7n,
  name: "트레카 A",
  description: null,
  purchasePriceJpy: 1500,
  purchaseExchangeRate: new Prisma.Decimal("925.0000"),
  purchasePriceKrw: 13875,
  packagingCostKrw: 0,
  overseasShippingKrw: 0,
  domesticShippingKrw: 0,
  otherCostKrw: 0,
  purchaser: null,
  purchaseDate: new Date("2026-04-15T00:00:00.000Z"),
  regularPrice: 25000,
  salePrice: 25000,
  condition: null,
  stockQuantity: 3,
  saleStatus: "active",
  seriesId: null,
  catalogCardId: null,
  marketAvgJpy: 0,
  marketMinJpy: 0,
  marketMaxJpy: 0,
  marketSoldCount: 0,
  retailPriceJpy: 0,
  saleMode: "fixed",
  auctionStartPrice: null,
  auctionCurrentPrice: null,
  auctionBidCount: 0,
  auctionEndsAt: null,
  auctionStatus: null,
  auctionWinnerAccountId: null,
  auctionPayDueAt: null,
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  createdBy: null,
  updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  updatedBy: null,
};

const photoRow: PrismaProductPhoto = {
  id: 200n,
  productId: 100n,
  r2Key: "products/100/front.jpg",
  altText: "정면",
  displayOrder: 0,
  isThumbnail: true,
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  createdBy: null,
  updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  updatedBy: null,
};

describe("toProduct", () => {
  it("BigInt id·teamId·memberId를 number로 변환한다", () => {
    const product = toProduct(productRow);
    expect(product.id).toBe(100);
    expect(product.teamId).toBe(5);
    expect(product.memberId).toBe(7);
  });

  it("teamId·memberId가 null이면 그대로 null", () => {
    const product = toProduct({ ...productRow, teamId: null, memberId: null });
    expect(product.teamId).toBeNull();
    expect(product.memberId).toBeNull();
  });

  it("Decimal 환율을 number로 변환한다", () => {
    expect(toProduct(productRow).purchaseExchangeRate).toBe(925);
  });

  it("purchaseDate는 YYYY-MM-DD ISO date string", () => {
    expect(toProduct(productRow).purchaseDate).toBe("2026-04-15");
  });

  it("itemType과 saleStatus는 enum literal로 노출", () => {
    const product = toProduct(productRow);
    expect(product.itemType).toBe("photocard");
    expect(product.saleStatus).toBe("active");
  });
});

describe("toProductPhoto", () => {
  it("BigInt id·productId를 number로 변환한다", () => {
    const photo = toProductPhoto(photoRow);
    expect(photo.id).toBe(200);
    expect(photo.productId).toBe(100);
  });

  it("display·thumbnail 필드를 그대로 유지", () => {
    const photo = toProductPhoto(photoRow);
    expect(photo.displayOrder).toBe(0);
    expect(photo.isThumbnail).toBe(true);
  });
});
