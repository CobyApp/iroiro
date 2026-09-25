import "server-only";

import type {
  UsedListing as PrismaUsedListing,
  UsedListingPhoto as PrismaUsedListingPhoto,
  UsedTrade as PrismaUsedTrade,
} from "@prisma/client";
import type {
  MeetLocation,
  ProductCondition,
  UsedAuctionStatus,
  UsedListing,
  UsedListingPhoto,
  UsedSaleMode,
  UsedShippingMethod,
  UsedStatus,
  UsedTrade,
  UsedTradeKind,
  UsedTradeStatus,
} from "../types";

// meet_locations(jsonb) 를 방어적으로 MeetLocation[] 로 정규화 — 깨진 값은 버린다.
function parseMeetLocations(value: unknown): MeetLocation[] {
  if (!Array.isArray(value)) return [];
  const out: MeetLocation[] = [];
  for (const v of value) {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label : "";
      const address = typeof o.address === "string" ? o.address : "";
      const lat = typeof o.lat === "number" ? o.lat : NaN;
      const lng = typeof o.lng === "number" ? o.lng : NaN;
      if (label && Number.isFinite(lat) && Number.isFinite(lng)) {
        out.push({ label, address, lat, lng });
      }
    }
  }
  return out;
}

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
    parcelEnabled: row.parcelEnabled,
    directEnabled: row.directEnabled,
    meetLocations: parseMeetLocations(row.meetLocations),
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
    tradeKind: row.tradeKind as UsedTradeKind,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    recipientAddress: row.recipientAddress,
    postTrackingCode: row.postTrackingCode,
    courier: row.courier ?? null,
    postQrIssuedAt: row.postQrIssuedAt?.toISOString() ?? null,
    shippedAt: row.shippedAt?.toISOString() ?? null,
    handedOverAt: row.handedOverAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    disputedAt: row.disputedAt?.toISOString() ?? null,
    disputeReason: row.disputeReason ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    refundAmount: row.refundAmount ?? null,
    refundReason: row.refundReason ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
