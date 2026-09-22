import "server-only";

import type {
  UsedListing as PrismaUsedListing,
  UsedListingPhoto as PrismaUsedListingPhoto,
  UsedTrade as PrismaUsedTrade,
} from "@prisma/client";
import type {
  ProductCondition,
  UsedAuctionStatus,
  UsedListing,
  UsedListingPhoto,
  UsedSaleMode,
  UsedShippingMethod,
  UsedStatus,
  UsedTrade,
  UsedTradeStatus,
} from "../types";

export function toUsedListing(row: PrismaUsedListing): UsedListing {
  return {
    id: Number(row.id),
    sellerAccountId: row.sellerAccountId,
    itemType: row.itemType,
    teamId: row.teamId !== null ? Number(row.teamId) : null,
    memberId: row.memberId !== null ? Number(row.memberId) : null,
    seriesId: row.seriesId !== null ? Number(row.seriesId) : null,
    sourceProductId:
      row.sourceProductId !== null ? Number(row.sourceProductId) : null,
    title: row.title,
    description: row.description,
    condition: row.condition as ProductCondition,
    saleMode: row.saleMode as UsedSaleMode,
    price: row.price,
    shippingMethod: row.shippingMethod as UsedShippingMethod,
    shippingFee: row.shippingFee,
    status: row.status as UsedStatus,
    auctionStartPrice: row.auctionStartPrice,
    auctionCurrentPrice: row.auctionCurrentPrice,
    auctionBidCount: row.auctionBidCount,
    auctionEndsAt: row.auctionEndsAt?.toISOString() ?? null,
    auctionStatus: row.auctionStatus as UsedAuctionStatus | null,
    auctionWinnerAccountId: row.auctionWinnerAccountId,
    auctionPayDueAt: row.auctionPayDueAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toUsedListingPhoto(
  row: PrismaUsedListingPhoto,
): UsedListingPhoto {
  return {
    id: Number(row.id),
    listingId: Number(row.listingId),
    r2Key: row.r2Key,
    displayOrder: row.displayOrder,
    isPrimary: row.isPrimary,
  };
}

export function toUsedTrade(row: PrismaUsedTrade): UsedTrade {
  return {
    id: Number(row.id),
    listingId: Number(row.listingId),
    buyerAccountId: row.buyerAccountId,
    sellerAccountId: row.sellerAccountId,
    price: row.price,
    shippingFee: row.shippingFee,
    feeBp: row.feeBp,
    feeAmount: row.feeAmount,
    sellerPayout: row.sellerPayout,
    status: row.status as UsedTradeStatus,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    recipientAddress: row.recipientAddress,
    postTrackingCode: row.postTrackingCode,
    postQrIssuedAt: row.postQrIssuedAt?.toISOString() ?? null,
    shippedAt: row.shippedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
