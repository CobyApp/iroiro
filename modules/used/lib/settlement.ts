import "server-only";

import { db } from "@/lib/db";

// 중고 정산 리포트 — 완료된 거래(usedTrade, 묶음 포함: 각 행이 자기 몫 sellerPayout 보유)를
// 판매자별로 합산해 "얼마를 정산해야 하는지" 보여준다. 기간은 완료 시각 기준.
export type SettlementRow = {
  sellerAccountId: string;
  sellerName: string;
  tradeCount: number;
  payoutTotal: number; // 판매자에게 줄 금액 합
  feeTotal: number; // 플랫폼 수수료 합
};
export type SettlementReport = {
  days: number;
  tradeCount: number;
  payoutTotal: number;
  feeTotal: number;
  rows: SettlementRow[];
};

export async function getUsedSettlementReport(days = 30): Promise<SettlementReport> {
  const since = new Date(Date.now() - days * 86400000);
  const grouped = await db.usedTrade.groupBy({
    by: ["sellerAccountId"],
    where: { status: "completed", completedAt: { gte: since } },
    _count: { _all: true },
    _sum: { sellerPayout: true, feeAmount: true },
  });

  const sellerIds = grouped.map((g) => g.sellerAccountId);
  const accounts = sellerIds.length
    ? await db.account.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameById = new Map(accounts.map((a) => [a.id, a.displayName]));

  const rows: SettlementRow[] = grouped
    .map((g) => ({
      sellerAccountId: g.sellerAccountId,
      sellerName: nameById.get(g.sellerAccountId) ?? "(탈퇴 회원)",
      tradeCount: g._count._all,
      payoutTotal: g._sum.sellerPayout ?? 0,
      feeTotal: g._sum.feeAmount ?? 0,
    }))
    .sort((a, b) => b.payoutTotal - a.payoutTotal);

  return {
    days,
    tradeCount: rows.reduce((s, r) => s + r.tradeCount, 0),
    payoutTotal: rows.reduce((s, r) => s + r.payoutTotal, 0),
    feeTotal: rows.reduce((s, r) => s + r.feeTotal, 0),
    rows,
  };
}
