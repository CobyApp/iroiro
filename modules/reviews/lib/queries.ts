import "server-only";

import { db } from "@/lib/db";
import { maskReviewerName, averageRating } from "./rules";

export type ReviewRow = {
  id: number;
  rating: number;
  body: string;
  reviewer: string;
  isMine: boolean;
  createdAt: string;
};

export type ReviewSummary = {
  count: number;
  average: number | null;
};

/** 상품 리뷰 목록 — 마스킹된 이름, 최신순. viewer 본인 리뷰는 isMine 표시. */
export async function listProductReviews(
  productId: number,
  viewerAccountId: string | null,
  limit = 30,
): Promise<{ reviews: ReviewRow[]; summary: ReviewSummary }> {
  // 숨김(관리자 신고 처리) 리뷰는 고객 화면·집계에서 제외한다.
  const visible = { productId: BigInt(productId), hiddenAt: null };
  const rows = await db.productReview.findMany({
    where: visible,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const [count, ratingRows] = await Promise.all([
    db.productReview.count({ where: visible }),
    db.productReview.findMany({
      where: visible,
      select: { rating: true },
    }),
  ]);

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accounts = accountIds.length
    ? await db.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameById = new Map(accounts.map((a) => [a.id, a.displayName]));

  return {
    reviews: rows.map((row) => ({
      id: Number(row.id),
      rating: row.rating,
      body: row.body,
      reviewer: maskReviewerName(nameById.get(row.accountId) ?? "익명"),
      isMine: viewerAccountId !== null && row.accountId === viewerAccountId,
      createdAt: row.createdAt.toISOString(),
    })),
    summary: {
      count,
      average: averageRating(ratingRows.map((r) => r.rating)),
    },
  };
}

export type MyOrderReview = {
  id: number;
  productId: number;
  rating: number;
  body: string;
};

/** 주문 상세용 — 이 주문에서 내가 이미 남긴 리뷰(상품 id별). */
export async function listMyReviewsForOrder(
  accountId: string,
  orderId: number,
): Promise<MyOrderReview[]> {
  const rows = await db.productReview.findMany({
    where: { accountId, orderId: BigInt(orderId) },
  });
  return rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.productId),
    rating: row.rating,
    body: row.body,
  }));
}
