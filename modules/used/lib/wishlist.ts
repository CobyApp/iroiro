import "server-only";

import { db } from "@/lib/db";
import type { UsedListingWithPhotos } from "../types";
import { listUsedListingsByIds } from "./queries";

// 계정이 찜한 중고 매물 id 집합 — 카드별 하트 상태 표시용.
export async function getUsedWishlistIds(
  accountId: string,
): Promise<Set<number>> {
  const rows = await db.usedWishlist.findMany({
    where: { accountId },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => Number(r.listingId)));
}

// 찜한 중고 매물 목록(최신 찜 순). 상태와 무관하게 찜한 그대로 반환.
export async function listUsedWishlistListings(
  accountId: string,
): Promise<UsedListingWithPhotos[]> {
  const rows = await db.usedWishlist.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: { listingId: true },
  });
  if (rows.length === 0) return [];
  const listings = await listUsedListingsByIds(
    rows.map((r) => Number(r.listingId)),
  );
  const byId = new Map(listings.map((l) => [l.id, l]));
  return rows
    .map((r) => byId.get(Number(r.listingId)))
    .filter((l): l is UsedListingWithPhotos => l !== undefined);
}
