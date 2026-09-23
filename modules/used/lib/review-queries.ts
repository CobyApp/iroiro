import "server-only";
import { db } from "@/lib/db";
import type { SellerReviewSummary, UsedReview } from "../types";

const maskAcct = (id: string) => `#${id.slice(-4)}`;

// 사용자(대상) 후기 요약 — 평균 별점(소수 1자리)·개수. reviewee 기준(받은 후기).
export async function getSellerReviewSummary(
  accountId: string,
): Promise<SellerReviewSummary> {
  // 숨김(관리자 신고 처리) 후기는 요약에서 제외.
  const agg = await db.usedReview.aggregate({
    where: { revieweeAccountId: accountId, hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    count: agg._count._all,
    avg: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
  };
}

// 사용자(대상)가 받은 후기 목록(최신순). 작성자는 마스킹. reviewee 기준.
export async function listSellerReviews(
  accountId: string,
  limit = 20,
): Promise<UsedReview[]> {
  const rows = await db.usedReview.findMany({
    where: { revieweeAccountId: accountId, hiddenAt: null },
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

// 마이페이지 — 내가 받은 후기(reviewee = me). 작성자 마스킹.
export async function listReviewsReceived(
  accountId: string,
  limit = 30,
): Promise<UsedReview[]> {
  return listSellerReviews(accountId, limit);
}

// 마이페이지 — 내가 쓴 후기(reviewer = me). 대상(reviewee) 마스킹.
export async function listReviewsWritten(
  accountId: string,
  limit = 30,
): Promise<UsedReview[]> {
  const rows = await db.usedReview.findMany({
    where: { reviewerAccountId: accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: Number(r.id),
    tradeId: Number(r.tradeId),
    listingId: Number(r.listingId),
    // 내가 쓴 후기 목록에서는 '대상'을 마스킹해 보여준다.
    reviewerMasked: maskAcct(r.revieweeAccountId),
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
