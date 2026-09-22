import "server-only";
import { db } from "@/lib/db";
import type { SellerReviewSummary, UsedReview } from "../types";

const maskAcct = (id: string) => `#${id.slice(-4)}`;

// 판매자 후기 요약 — 평균 별점(소수 1자리)·개수.
export async function getSellerReviewSummary(
  sellerAccountId: string,
): Promise<SellerReviewSummary> {
  const agg = await db.usedReview.aggregate({
    where: { sellerAccountId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    count: agg._count._all,
    avg: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
  };
}

// 판매자 후기 목록(최신순). 작성자는 마스킹.
export async function listSellerReviews(
  sellerAccountId: string,
  limit = 20,
): Promise<UsedReview[]> {
  const rows = await db.usedReview.findMany({
    where: { sellerAccountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: Number(r.id),
    tradeId: Number(r.tradeId),
    listingId: Number(r.listingId),
    reviewerMasked: maskAcct(r.reviewerAccountId),
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  }));
}

// 구매자가 이미 후기를 남긴 거래 id 집합 — 마이 구매내역에서 '후기 작성' 노출 판단.
export async function reviewedTradeIdsOf(
  reviewerAccountId: string,
  tradeIds: number[],
): Promise<Set<number>> {
  if (tradeIds.length === 0) return new Set();
  const rows = await db.usedReview.findMany({
    where: {
      reviewerAccountId,
      tradeId: { in: tradeIds.map((id) => BigInt(id)) },
    },
    select: { tradeId: true },
  });
  return new Set(rows.map((r) => Number(r.tradeId)));
}
