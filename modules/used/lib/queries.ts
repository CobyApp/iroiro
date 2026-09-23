import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  toUsedListing,
  toUsedListingPhoto,
  toUsedTrade,
} from "./transform";
import type { UsedListingWithPhotos, UsedTrade } from "../types";
import {
  buildListingFacets,
  type ListingFacets,
} from "@/modules/products/lib/facets";

export type UsedListFilter = {
  teamId?: number;
  memberId?: number;
  seriesId?: number;
  saleMode?: "fixed" | "auction";
  /** 굿즈 종류(used_listing.item_type) — 토레카·체키 등. */
  itemType?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

async function attachPhotosAndSellers(
  rows: Prisma.UsedListingGetPayload<object>[],
): Promise<UsedListingWithPhotos[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const sellerIds = [...new Set(rows.map((r) => r.sellerAccountId))];
  const [photoRows, sellers, wishRows] = await Promise.all([
    db.usedListingPhoto.findMany({
      where: { listingId: { in: ids } },
      orderBy: { displayOrder: "asc" },
    }),
    db.account.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, displayName: true },
    }),
    // 매물별 찜 수 — 리스트 카드에 노출(관심도 지표).
    db.usedWishlist.groupBy({
      by: ["listingId"],
      where: { listingId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const photosBy = new Map<number, ReturnType<typeof toUsedListingPhoto>[]>();
  for (const p of photoRows) {
    const key = Number(p.listingId);
    const arr = photosBy.get(key) ?? [];
    arr.push(toUsedListingPhoto(p));
    photosBy.set(key, arr);
  }
  const nameBy = new Map(sellers.map((s) => [s.id, s.displayName]));
  const wishBy = new Map(
    wishRows.map((w) => [Number(w.listingId), w._count._all]),
  );
  return rows.map((row) => ({
    ...toUsedListing(row),
    photos: photosBy.get(Number(row.id)) ?? [],
    sellerName: nameBy.get(row.sellerAccountId) ?? "판매자",
    wishCount: wishBy.get(Number(row.id)) ?? 0,
  }));
}

// 고객에게 보이는 중고 매물 — 판매중(+거래중). 목록·facet 이 같은 규칙을 공유한다.
const LIVE_USED_STATUS: Prisma.UsedListingWhereInput = {
  status: { in: ["active", "reserved"] },
};

// 중고거래 홈 필터 칩용 facet — listUsedListings 와 같은 노출 규칙(status active·reserved).
export async function listUsedListingFacets(): Promise<ListingFacets> {
  const rows = await db.usedListing.groupBy({
    by: ["teamId", "memberId", "saleMode"],
    where: LIVE_USED_STATUS,
    _count: { _all: true },
  });
  return buildListingFacets(
    rows.map((r) => ({
      teamId: r.teamId,
      memberId: r.memberId,
      saleMode: r.saleMode,
      count: r._count._all,
    })),
  );
}

// 노출 중 매물이 있는 굿즈 종류 목록(칩·필터용) — 결과 없는 종류는 뺀다.
export async function listUsedItemTypesInUse(): Promise<string[]> {
  const rows = await db.usedListing.groupBy({
    by: ["itemType"],
    where: LIVE_USED_STATUS,
    _count: { _all: true },
  });
  return rows.map((r) => r.itemType);
}

// 중고 매물 목록 — 판매중(+거래중)만. 대표사진 포함.
export async function listUsedListings(
  filter: UsedListFilter = {},
): Promise<{ items: UsedListingWithPhotos[]; total: number }> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 24;
  const where: Prisma.UsedListingWhereInput = { ...LIVE_USED_STATUS };
  if (filter.teamId !== undefined) where.teamId = BigInt(filter.teamId);
  if (filter.memberId !== undefined) where.memberId = BigInt(filter.memberId);
  if (filter.seriesId !== undefined) where.seriesId = BigInt(filter.seriesId);
  if (filter.saleMode) where.saleMode = filter.saleMode;
  if (filter.itemType) where.itemType = filter.itemType;
  if (filter.q) where.title = { contains: filter.q, mode: "insensitive" };

  const [rows, total] = await Promise.all([
    db.usedListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.usedListing.count({ where }),
  ]);
  return { items: await attachPhotosAndSellers(rows), total };
}

// 마감 임박 진행중 경매 — 중고 홈 상단 큐레이션 행.
export async function listEndingSoonUsedAuctions(
  limit = 8,
): Promise<UsedListingWithPhotos[]> {
  const rows = await db.usedListing.findMany({
    where: {
      status: "active",
      saleMode: "auction",
      auctionStatus: "live",
      auctionEndsAt: { gt: new Date() },
    },
    orderBy: { auctionEndsAt: "asc" },
    take: limit,
  });
  return attachPhotosAndSellers(rows);
}

// 최신 등록 매물 — 중고 홈 큐레이션 행(경매 제외 여부는 호출부가 결정).
export async function listNewestUsedListings(
  limit = 8,
): Promise<UsedListingWithPhotos[]> {
  const rows = await db.usedListing.findMany({
    where: { status: { in: ["active", "reserved"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return attachPhotosAndSellers(rows);
}

// id 목록으로 조회 — 찜 목록 등 별도 정렬을 유지해야 하는 호출부용.
export async function listUsedListingsByIds(
  ids: number[],
): Promise<UsedListingWithPhotos[]> {
  if (ids.length === 0) return [];
  const rows = await db.usedListing.findMany({
    where: { id: { in: ids.map((id) => BigInt(id)) } },
  });
  return attachPhotosAndSellers(rows);
}

export async function getUsedListingById(
  id: number,
): Promise<UsedListingWithPhotos | null> {
  const row = await db.usedListing.findUnique({ where: { id: BigInt(id) } });
  if (!row) return null;
  const [withAll] = await attachPhotosAndSellers([row]);
  return withAll;
}

// 판매자의 판매중 매물 — 상세의 "이 판매자의 다른 매물", 판매자 상점 목록.
export async function listSellerListings(
  sellerAccountId: string,
  opts: { excludeId?: number; page?: number; pageSize?: number } = {},
): Promise<{ items: UsedListingWithPhotos[]; total: number }> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 24;
  const where: Prisma.UsedListingWhereInput = {
    sellerAccountId,
    status: { in: ["active", "reserved"] },
    ...(opts.excludeId !== undefined ? { id: { not: BigInt(opts.excludeId) } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.usedListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.usedListing.count({ where }),
  ]);
  return { items: await attachPhotosAndSellers(rows), total };
}

// 판매자 상점 요약 — 이름 + 판매중/판매완료 수.
export async function getSellerSummary(
  sellerAccountId: string,
): Promise<{ name: string; activeCount: number; soldCount: number } | null> {
  const [account, activeCount, soldCount] = await Promise.all([
    db.account.findFirst({
      where: { id: sellerAccountId },
      select: { displayName: true },
    }),
    db.usedListing.count({
      where: { sellerAccountId, status: { in: ["active", "reserved"] } },
    }),
    db.usedListing.count({ where: { sellerAccountId, status: "sold" } }),
  ]);
  if (!account) return null;
  return { name: account.displayName, activeCount, soldCount };
}

// 내 매물 (판매자용) — 모든 상태.
export async function listMyUsedListings(
  accountId: string,
): Promise<UsedListingWithPhotos[]> {
  const rows = await db.usedListing.findMany({
    where: { sellerAccountId: accountId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return attachPhotosAndSellers(rows);
}

// 묶음 구매 상세 — 묶음 + 소속 매물들(사진 포함). 당사자만 접근(호출부에서 검증).
export async function getUsedBundleById(
  id: number,
): Promise<{ bundle: import("../types").UsedBundle; items: UsedListingWithPhotos[] } | null> {
  const row = await db.usedBundle.findUnique({ where: { id: BigInt(id) } });
  if (!row) return null;
  const trades = await db.usedTrade.findMany({
    where: { bundleId: row.id },
    select: { listingId: true },
  });
  const items = await listUsedListingsByIds(trades.map((t) => Number(t.listingId)));
  return {
    bundle: {
      id: Number(row.id),
      buyerAccountId: row.buyerAccountId,
      sellerAccountId: row.sellerAccountId,
      itemTotal: row.itemTotal,
      shippingFee: row.shippingFee,
      pointsUsed: row.pointsUsed,
      feeAmount: row.feeAmount,
      sellerPayout: row.sellerPayout,
      status: row.status as import("../types").UsedBundleStatus,
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      recipientAddress: row.recipientAddress,
      postTrackingCode: row.postTrackingCode,
      courier: row.courier ?? null,
      shippedAt: row.shippedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    },
    items,
  };
}

// 매물의 유효 거래(취소 제외) — 구매자/판매자 진행 패널용.
export async function getActiveTradeForListing(
  listingId: number,
): Promise<UsedTrade | null> {
  const row = await db.usedTrade.findFirst({
    where: { listingId: BigInt(listingId), status: { not: "canceled" } },
  });
  return row ? toUsedTrade(row) : null;
}

// 내 구매 내역 (구매자용).
export async function listMyUsedPurchases(
  accountId: string,
): Promise<UsedTrade[]> {
  const rows = await db.usedTrade.findMany({
    where: { buyerAccountId: accountId, status: { not: "canceled" } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(toUsedTrade);
}

// 같은 시리즈 중고의 최근 완료 거래가 — 등록 화면 가격 추천·상세 참고용.
export async function listUsedSoldPrices(
  seriesId: number,
  limit = 5,
): Promise<{ price: number; createdAt: string }[]> {
  const listings = await db.usedListing.findMany({
    where: { seriesId: BigInt(seriesId) },
    select: { id: true },
  });
  if (listings.length === 0) return [];
  const rows = await db.usedTrade.findMany({
    where: {
      listingId: { in: listings.map((l) => l.id) },
      status: { in: ["paid", "shipped", "completed"] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { price: true, createdAt: true },
  });
  return rows.map((r) => ({
    price: r.price,
    createdAt: r.createdAt.toISOString(),
  }));
}
