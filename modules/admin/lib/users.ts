import "server-only";

import { db } from "@/lib/db";
import { type AdminSpace, isAdminSpace } from "./adminRoles";

export type AdminUserRow = {
  id: string;
  displayName: string;
  publicCode: string;
  isAdmin: boolean;
  /** 보유한 부분 관리 권한 — 배송·중고·커뮤니티·토레카. */
  adminRoles: AdminSpace[];
  postingBanned: boolean;
  postingBanReason: string | null;
  createdAt: string;
};

// 회원 검색 — 닉네임 부분일치 또는 #공개코드 정확일치. 탈퇴 계정 제외.
export async function listAdminUsers(q?: string): Promise<AdminUserRow[]> {
  const query = q?.trim();
  const rows = await db.account.findMany({
    where: {
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { publicCode: { equals: query } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      displayName: true,
      publicCode: true,
      isAdmin: true,
      adminRoles: true,
      postingBannedAt: true,
      postingBanReason: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    publicCode: r.publicCode,
    isAdmin: r.isAdmin,
    adminRoles: (r.adminRoles as string[]).filter(isAdminSpace),
    postingBanned: r.postingBannedAt !== null,
    postingBanReason: r.postingBanReason,
    createdAt: r.createdAt.toISOString(),
  }));
}

// 매출로 집계하는 주문 상태 — 결제 승인 이후(취소·미결제 제외).
const PAID_ORDER_STATUSES = ["paid", "shipped", "delivered"];

export type AdminUserDetail = AdminUserRow & {
  activity: {
    orderCount: number;
    orderPaidTotal: number;
    usedSoldCount: number; // 판매 완료 건
    usedBoughtCount: number; // 구매 완료 건
    pointBalance: number;
    postCount: number;
    reviewCount: number; // 스토어 리뷰 + 중고 후기
  };
};

// 회원 상세 — 기본 정보 + 활동 요약(주문·중고·포인트·글·후기). site admin 전용 화면이 쓴다.
export async function getAdminUserDetail(
  accountId: string,
): Promise<AdminUserDetail | null> {
  const r = await db.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: {
      id: true,
      displayName: true,
      publicCode: true,
      isAdmin: true,
      adminRoles: true,
      postingBannedAt: true,
      postingBanReason: true,
      createdAt: true,
    },
  });
  if (!r) return null;

  const [orderAgg, usedSold, usedBought, pointAgg, postCount, storeReviews, usedReviews] =
    await Promise.all([
      db.order.aggregate({
        where: { accountId, status: { in: PAID_ORDER_STATUSES } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      db.usedTrade.count({ where: { sellerAccountId: accountId, status: "completed" } }),
      db.usedTrade.count({ where: { buyerAccountId: accountId, status: "completed" } }),
      db.pointTransaction.aggregate({ where: { accountId }, _sum: { amount: true } }),
      db.post.count({ where: { accountId } }),
      db.productReview.count({ where: { accountId } }),
      db.usedReview.count({ where: { reviewerAccountId: accountId } }),
    ]);

  return {
    id: r.id,
    displayName: r.displayName,
    publicCode: r.publicCode,
    isAdmin: r.isAdmin,
    adminRoles: (r.adminRoles as string[]).filter(isAdminSpace),
    postingBanned: r.postingBannedAt !== null,
    postingBanReason: r.postingBanReason,
    createdAt: r.createdAt.toISOString(),
    activity: {
      orderCount: orderAgg._count._all,
      orderPaidTotal: orderAgg._sum.totalAmount ?? 0,
      usedSoldCount: usedSold,
      usedBoughtCount: usedBought,
      pointBalance: pointAgg._sum.amount ?? 0,
      postCount,
      reviewCount: storeReviews + usedReviews,
    },
  };
}

export type AdminUserOrderRow = {
  orderNo: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  firstItemName: string | null;
  createdAt: string;
};
export type AdminUserTradeRow = {
  listingId: number;
  listingTitle: string;
  role: "buyer" | "seller";
  status: string;
  price: number;
  createdAt: string;
};
export type AdminUserActivityLists = {
  orders: AdminUserOrderRow[];
  trades: AdminUserTradeRow[];
};

// 회원 상세 인라인 리스트 — 최근 주문 8건 + 최근 중고 거래 8건(구매·판매 합산).
export async function getAdminUserActivity(
  accountId: string,
): Promise<AdminUserActivityLists> {
  const [orderRows, buyerTrades, sellerTrades] = await Promise.all([
    db.order.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNo: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
    }),
    db.usedTrade.findMany({
      where: { buyerAccountId: accountId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { listingId: true, status: true, price: true, createdAt: true },
    }),
    db.usedTrade.findMany({
      where: { sellerAccountId: accountId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { listingId: true, status: true, price: true, createdAt: true },
    }),
  ]);

  // 주문별 상품명·개수 — 소량이라 한 번에 조회 후 메모리 집계.
  const orderIds = orderRows.map((o) => o.id);
  const items = orderIds.length
    ? await db.orderItem.findMany({
        where: { orderId: { in: orderIds } },
        orderBy: { id: "asc" },
        select: { orderId: true, productName: true },
      })
    : [];
  const itemAgg = new Map<bigint, { first: string; count: number }>();
  for (const it of items) {
    const cur = itemAgg.get(it.orderId);
    if (cur) cur.count += 1;
    else itemAgg.set(it.orderId, { first: it.productName, count: 1 });
  }
  const orders: AdminUserOrderRow[] = orderRows.map((o) => {
    const agg = itemAgg.get(o.id);
    return {
      orderNo: o.orderNo,
      status: o.status,
      totalAmount: o.totalAmount,
      itemCount: agg?.count ?? 0,
      firstItemName: agg?.first ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  });

  // 중고 거래 — 구매/판매 합쳐 최신 8건, 매물 제목 해석.
  const merged = [
    ...buyerTrades.map((t) => ({ ...t, role: "buyer" as const })),
    ...sellerTrades.map((t) => ({ ...t, role: "seller" as const })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);
  const listingIds = [...new Set(merged.map((t) => t.listingId))];
  const listings = listingIds.length
    ? await db.usedListing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, title: true },
      })
    : [];
  const titleById = new Map(listings.map((l) => [Number(l.id), l.title]));
  const trades: AdminUserTradeRow[] = merged.map((t) => ({
    listingId: Number(t.listingId),
    listingTitle: titleById.get(Number(t.listingId)) ?? "(삭제된 매물)",
    role: t.role,
    status: t.status,
    price: t.price,
    createdAt: t.createdAt.toISOString(),
  }));

  return { orders, trades };
}
