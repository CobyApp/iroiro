import "server-only";

import { db } from "@/lib/db";

export type AdminReviewRow = {
  id: number;
  productId: number;
  productName: string;
  reviewerName: string;
  rating: number;
  body: string;
  createdAt: string;
};

/** 관리자 리뷰 목록 — 최신순, 상품명·작성자 실명 표시(관리 용도). */
export async function listReviewsForAdmin(
  limit = 100,
): Promise<AdminReviewRow[]> {
  const rows = await db.productReview.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const [products, accounts] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    }),
    db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, displayName: true },
    }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p.name]));
  const nameById = new Map(accounts.map((a) => [a.id, a.displayName]));

  return rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.productId),
    productName: productById.get(row.productId) ?? "(삭제된 상품)",
    reviewerName: nameById.get(row.accountId) ?? "(탈퇴 회원)",
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}
