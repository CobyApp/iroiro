import "server-only";

import type {
  Product as PrismaProduct,
  ProductPhoto as PrismaProductPhoto,
} from "@prisma/client";
import { formatKstDate } from "@/lib/datetime";
import type {
  AuctionStatus,
  ItemType,
  Product,
  ProductCondition,
  ProductPhoto,
  SaleMode,
  SaleStatus,
} from "../types";

export function toProduct(row: PrismaProduct): Product {
  return {
    id: Number(row.id),
    itemCode: row.itemCode,
    sourceId: row.sourceId,
    itemType: row.itemType as ItemType,
    teamId: row.teamId !== null ? Number(row.teamId) : null,
    memberId: row.memberId !== null ? Number(row.memberId) : null,
    name: row.name,
    description: row.description,
    purchasePriceJpy: row.purchasePriceJpy,
    purchaseExchangeRate: Number(row.purchaseExchangeRate),
    purchasePriceKrw: row.purchasePriceKrw,
    packagingCostKrw: row.packagingCostKrw,
    overseasShippingKrw: row.overseasShippingKrw,
    domesticShippingKrw: row.domesticShippingKrw,
    otherCostKrw: row.otherCostKrw,
    purchaser: row.purchaser,
    purchaseDate: formatKstDate(row.purchaseDate),
    regularPrice: row.regularPrice,
    salePrice: row.salePrice,
    condition: row.condition as ProductCondition | null,
    stockQuantity: row.stockQuantity,
    saleStatus: row.saleStatus as SaleStatus,
    seriesId: row.seriesId !== null ? Number(row.seriesId) : null,
    marketAvgJpy: row.marketAvgJpy,
    marketMinJpy: row.marketMinJpy,
    marketMaxJpy: row.marketMaxJpy,
    marketSoldCount: row.marketSoldCount,
    retailPriceJpy: row.retailPriceJpy,
    saleMode: row.saleMode as SaleMode,
    auctionStartPrice: row.auctionStartPrice,
    auctionCurrentPrice: row.auctionCurrentPrice,
    auctionBidCount: row.auctionBidCount,
    auctionEndsAt: row.auctionEndsAt?.toISOString() ?? null,
    auctionStatus: row.auctionStatus as AuctionStatus | null,
    auctionWinnerAccountId: row.auctionWinnerAccountId,
    auctionPayDueAt: row.auctionPayDueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProductPhoto(row: PrismaProductPhoto): ProductPhoto {
  return {
    id: Number(row.id),
    productId: Number(row.productId),
    r2Key: row.r2Key,
    altText: row.altText,
    displayOrder: row.displayOrder,
    isThumbnail: row.isThumbnail,
    createdAt: row.createdAt.toISOString(),
  };
}
