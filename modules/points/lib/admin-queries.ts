import "server-only";

import { db } from "@/lib/db";
import type { PointReason } from "./rules";

export type AdminPointRow = {
  id: number;
  accountId: string | null;
  accountName: string;
  amount: number;
  reason: PointReason | string;
  memo: string | null;
  createdAt: string;
};

export type AdminPointPage = {
  items: AdminPointRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 30;

export type AdminCouponRow = {
  id: number;
  accountId: string | null;
  accountName: string;
  kind: string;
  used: boolean;
  createdAt: string;
  expiresAt: string | null;
};
export type AdminCouponSummary = {
  total: number;
  unused: number;
  used: number;
  recent: AdminCouponRow[];
};

// 발급 쿠폰 현황 — 총/미사용/사용 요약 + 최근 발급 10건(회원 링크용 accountId 포함).
export async function getCouponAdminSummary(): Promise<AdminCouponSummary> {
  const [total, used, rows] = await Promise.all([
    db.accountCoupon.count(),
    db.accountCoupon.count({ where: { usedAt: { not: null } } }),
    db.accountCoupon.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
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
  const recent: AdminCouponRow[] = rows.map((r) => ({
    id: Number(r.id),
    accountId: nameById.has(r.accountId) ? r.accountId : null,
    accountName: nameById.get(r.accountId) ?? "(탈퇴 회원)",
    kind: r.kind,
    used: r.usedAt !== null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
  }));
  return { total, unused: total - used, used, recent };
}

/**
 * 관리자 포인트 원장 — 최신순, 페이지네이션. q 로 회원(닉네임 부분일치·#공개코드 정확)을 걸러본다.
 */
export async function listPointTransactionsForAdmin(
  q?: string,
  page = 1,
): Promise<AdminPointPage> {
  const query = q?.trim();

  // 회원 검색이 있으면 대상 계정 id 집합으로 좁힌다(없으면 즉시 빈 결과).
  let accountFilter: string[] | undefined;
  if (query) {
    const matched = await db.account.findMany({
      where: {
        OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { publicCode: { equals: query.replace(/^#/, "") } },
        ],
      },
      select: { id: true },
      take: 500,
    });
    accountFilter = matched.map((a) => a.id);
    if (accountFilter.length === 0) {
      return { items: [], total: 0, page, pageSize: PAGE_SIZE };
    }
  }

  const where = accountFilter ? { accountId: { in: accountFilter } } : undefined;
  const [total, rows] = await Promise.all([
    db.pointTransaction.count({ where }),
    db.pointTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  if (rows.length === 0) return { items: [], total, page, pageSize: PAGE_SIZE };

  const accountIds = [...new Set(rows.map((r) => r.accountId))];
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(accounts.map((a) => [a.id, a.displayName]));

  const items = rows.map((row) => ({
    id: Number(row.id),
    accountId: nameById.has(row.accountId) ? row.accountId : null,
    accountName: nameById.get(row.accountId) ?? "(탈퇴 회원)",
    amount: row.amount,
    reason: row.reason,
    memo: row.memo,
    createdAt: row.createdAt.toISOString(),
  }));
  return { items, total, page, pageSize: PAGE_SIZE };
}
