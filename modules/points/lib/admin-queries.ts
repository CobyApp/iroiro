import "server-only";

import { db } from "@/lib/db";
import type { PointReason } from "./rules";

export type AdminPointRow = {
  id: number;
  accountName: string;
  amount: number;
  reason: PointReason | string;
  memo: string | null;
  createdAt: string;
};

/** 관리자 포인트 원장 — 전체 계정 최신순, 계정 이름 표시. */
export async function listPointTransactionsForAdmin(
  limit = 50,
): Promise<AdminPointRow[]> {
  const rows = await db.pointTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(accounts.map((a) => [a.id, a.displayName]));

  return rows.map((row) => ({
    id: Number(row.id),
    accountName: nameById.get(row.accountId) ?? "(탈퇴 회원)",
    amount: row.amount,
    reason: row.reason,
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
  }));
}
