import "server-only";

import { db } from "@/lib/db";
import { isCouponUsable, type PointReason } from "./rules";

/** 포인트 잔액 — 원장 합계. */
export async function getPointBalance(accountId: string): Promise<number> {
  const agg = await db.pointTransaction.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export type PointTransactionRow = {
  id: number;
  amount: number;
  reason: PointReason | string;
  memo: string | null;
  createdAt: string;
};

export async function listPointTransactions(
  accountId: string,
  limit = 50,
): Promise<PointTransactionRow[]> {
  const rows = await db.pointTransaction.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: Number(row.id),
    amount: row.amount,
    reason: row.reason,
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type CouponRow = {
  id: number;
  kind: string;
  issuedReason: string;
  expiresAt: string | null;
  usedAt: string | null;
};

export async function listCoupons(accountId: string): Promise<CouponRow[]> {
  const rows = await db.accountCoupon.findMany({
    where: { accountId },
    orderBy: [{ usedAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    issuedReason: row.issuedReason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
  }));
}

/** 지금 사용 가능한 무료배송 쿠폰 수 — 체크아웃 노출용. */
export async function countUsableFreeShippingCoupons(
  accountId: string,
): Promise<number> {
  const rows = await db.accountCoupon.findMany({
    where: { accountId, kind: "free_shipping", usedAt: null },
    select: { usedAt: true, expiresAt: true },
  });
  return rows.filter((row) =>
    isCouponUsable({
      usedAt: row.usedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    }),
  ).length;
}
