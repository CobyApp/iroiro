import "server-only";

import { db } from "@/lib/db";
import { todayKstYmd } from "@/lib/datetime";
import {
  PRODUCT_CONDITIONS,
  SALE_STATUSES,
  type ProductCondition,
  type SaleStatus,
} from "@/modules/products/types";
import type {
  BusinessSnapshot,
  ConditionDistribution,
  DashboardAlert,
  DashboardData,
  DashboardStats,
  RecentProduct,
  TeamDistribution,
} from "../types";

const RECENT_LIMIT = 10;
const TEAM_DISTRIBUTION_LIMIT = 10;
// 작업 알림은 최대 N건 노출. (N+1)번째가 발견되면 카드에 "N+" 표기.
const ALERT_VISIBLE_LIMIT = 10;
const ALERT_FETCH_LIMIT = ALERT_VISIBLE_LIMIT + 1;

// 화면에 "조회 기준" 안내로 노출 — UI도 같은 값을 본다.
export const RECENT_WINDOW_DAYS = 3;

function emptyByStatus(): Record<SaleStatus, number> {
  return SALE_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<SaleStatus, number>,
  );
}

// 매출로 집계하는 주문 상태 — 결제 승인 이후 전부(취소·미결제 제외).
const PAID_STATUSES = ["paid", "shipped", "delivered"];

async function getBusinessSnapshot(): Promise<BusinessSnapshot> {
  const now = new Date();
  // KST 자정 — todayKstYmd()가 KST 기준 날짜 문자열을 주므로 +09:00으로 고정.
  const kstMidnight = new Date(`${todayKstYmd()}T00:00:00+09:00`);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [
    todaySales,
    weekSales,
    totalSales,
    todayOrderCount,
    awaitingShipmentCount,
    liveAuctionCount,
    endingSoonAuctionCount,
    awardedUnpaidCount,
    memberCount,
    newMemberCount,
    reviewAgg,
    pointsAgg,
  ] = await Promise.all([
    db.order.aggregate({
      where: { status: { in: PAID_STATUSES }, createdAt: { gte: kstMidnight } },
      _sum: { totalAmount: true },
    }),
    db.order.aggregate({
      where: { status: { in: PAID_STATUSES }, createdAt: { gte: weekAgo } },
      _sum: { totalAmount: true },
    }),
    db.order.aggregate({
      where: { status: { in: PAID_STATUSES } },
      _sum: { totalAmount: true },
    }),
    db.order.count({
      where: { status: { in: PAID_STATUSES }, createdAt: { gte: kstMidnight } },
    }),
    db.order.count({ where: { status: "paid" } }),
    db.product.count({
      where: { saleMode: "auction", auctionStatus: "live" },
    }),
    db.product.count({
      where: {
        saleMode: "auction",
        auctionStatus: "live",
        auctionEndsAt: { lte: dayAhead },
      },
    }),
    // 결제 대기 낙찰 — 재고가 남아 있으면 아직 미결제(결제 시 재고 0).
    db.product.count({
      where: {
        saleMode: "auction",
        auctionStatus: "awarded",
        stockQuantity: { gt: 0 },
      },
    }),
    db.account.count({ where: { deletedAt: null } }),
    db.account.count({
      where: { deletedAt: null, createdAt: { gte: weekAgo } },
    }),
    db.productReview.aggregate({ _count: { _all: true }, _avg: { rating: true } }),
    db.pointTransaction.aggregate({ _sum: { amount: true } }),
  ]);

  return {
    todaySalesKrw: todaySales._sum.totalAmount ?? 0,
    weekSalesKrw: weekSales._sum.totalAmount ?? 0,
    totalSalesKrw: totalSales._sum.totalAmount ?? 0,
    todayOrderCount,
    awaitingShipmentCount,
    liveAuctionCount,
    endingSoonAuctionCount,
    awardedUnpaidCount,
    memberCount,
    newMemberCount,
    reviewCount: reviewAgg._count._all,
    reviewAverage:
      reviewAgg._avg.rating !== null
        ? Math.round(reviewAgg._avg.rating * 10) / 10
        : null,
    outstandingPointsKrw: pointsAgg._sum.amount ?? 0,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const recentSince = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [
    business,
    statusGroups,
    outOfStockRows,
    teamGroups,
    recentRows,
    conditionGroups,
  ] = await Promise.all([
    getBusinessSnapshot(),
    db.product.groupBy({
      by: ["saleStatus"],
      _count: { _all: true },
    }),
    db.product.findMany({
      where: { stockQuantity: 0 },
      orderBy: { updatedAt: "desc" },
      take: ALERT_FETCH_LIMIT,
      select: { id: true, name: true, saleStatus: true },
    }),
    db.product.groupBy({
      by: ["teamId"],
      _count: { _all: true },
      orderBy: { _count: { teamId: "desc" } },
      take: TEAM_DISTRIBUTION_LIMIT,
    }),
    db.product.findMany({
      where: { createdAt: { gte: recentSince } },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        saleStatus: true,
        createdAt: true,
      },
    }),
    db.product.groupBy({
      by: ["condition"],
      _count: { _all: true },
    }),
  ]);

  // top-10 teamId만 추려서 좁은 lookup만 fetch (전체 team 스캔 회피)
  const referencedTeamIds = teamGroups
    .map((g) => g.teamId)
    .filter((id): id is bigint => id !== null);
  const teamRows =
    referencedTeamIds.length === 0
      ? []
      : await db.team.findMany({
          where: { id: { in: referencedTeamIds } },
          select: { id: true, name: true },
        });

  // 썸네일은 Product↔ProductPhoto relation 미정의 상태라 별도 쿼리.
  const productIdsNeedingThumb = new Set<bigint>([
    ...outOfStockRows.map((r) => r.id),
    ...recentRows.map((r) => r.id),
  ]);
  const thumbnailRows =
    productIdsNeedingThumb.size === 0
      ? []
      : await db.productPhoto.findMany({
          where: {
            productId: { in: Array.from(productIdsNeedingThumb) },
            isThumbnail: true,
          },
          select: { productId: true, r2Key: true },
        });
  const thumbnailByProductId = new Map(
    thumbnailRows.map((row) => [row.productId.toString(), row.r2Key]),
  );
  function thumbFor(id: bigint): string | null {
    return thumbnailByProductId.get(id.toString()) ?? null;
  }

  // 가격 합계는 SUM(regular * qty) 가 필요하지만 Prisma _sum 만으로는 multiplication 못 함.
  // raw SQL을 한 번 추가 호출.
  // 재고 가치·매입 원가는 모든 상태의 상품 대상. stock_quantity가 0인 row는
  // 자연스럽게 0을 더하므로 sale_status 필터를 적용할 이유 없음.
  // sale_price NOT NULL — 할인이 없으면 regular_price와 동일한 값이 들어 있어 그대로 곱한다.
  const inventoryRows = await db.$queryRaw<
    { inventory_value: bigint | null; purchase_cost: bigint | null }[]
  >`
    SELECT
      COALESCE(SUM(sale_price * stock_quantity), 0)::bigint        AS inventory_value,
      COALESCE(SUM(purchase_price_krw * stock_quantity), 0)::bigint AS purchase_cost
    FROM product
  `;
  const inventoryValueKrw = Number(inventoryRows[0]?.inventory_value ?? 0n);
  const purchaseCostKrw = Number(inventoryRows[0]?.purchase_cost ?? 0n);

  const byStatus = emptyByStatus();
  for (const row of statusGroups) {
    byStatus[row.saleStatus as SaleStatus] = row._count._all;
  }

  const teamNameById = new Map(teamRows.map((t) => [Number(t.id), t.name]));
  const teamDistribution: TeamDistribution[] = teamGroups.map((row) => {
    const teamId = row.teamId !== null ? Number(row.teamId) : null;
    return {
      teamId,
      teamName:
        teamId === null
          ? "미지정"
          : (teamNameById.get(teamId) ?? "(알 수 없음)"),
      count: row._count._all,
    };
  });

  // LIMIT 11 트릭: ALERT_FETCH_LIMIT(=11)건 가져와 11번째 발견 시 hasMore=true.
  const outOfStockHasMore = outOfStockRows.length > ALERT_VISIBLE_LIMIT;
  const visibleOutOfStockRows = outOfStockRows.slice(0, ALERT_VISIBLE_LIMIT);
  const alerts: DashboardAlert[] = visibleOutOfStockRows.map(
    (row): DashboardAlert => ({
      productId: Number(row.id),
      productName: row.name,
      thumbnailR2Key: thumbFor(row.id),
      saleStatus: row.saleStatus as SaleStatus,
      detail: "재고 없음",
    }),
  );

  const recentProducts: RecentProduct[] = recentRows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    saleStatus: row.saleStatus as SaleStatus,
    createdAt: row.createdAt.toISOString(),
    thumbnailR2Key: thumbFor(row.id),
  }));

  const conditionCounts = new Map<ProductCondition | "unspecified", number>();
  for (const row of conditionGroups) {
    const key: ProductCondition | "unspecified" =
      (row.condition as ProductCondition | null) ?? "unspecified";
    conditionCounts.set(key, row._count._all);
  }
  const conditionDistribution: ConditionDistribution[] = [
    ...PRODUCT_CONDITIONS,
    "unspecified" as const,
  ].map((condition) => ({
    condition,
    count: conditionCounts.get(condition) ?? 0,
  }));

  const stats: DashboardStats = {
    totalProducts: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    inventoryValueKrw,
    purchaseCostKrw,
    outOfStockCount: visibleOutOfStockRows.length,
    outOfStockHasMore,
  };

  return {
    business,
    stats,
    alerts,
    teamDistribution,
    recentProducts,
    conditionDistribution,
  };
}
