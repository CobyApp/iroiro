import "server-only";

import { db } from "@/lib/db";
import { formatKstDate } from "@/lib/datetime";

// 스토어 매출 리포트 — 최근 N일 일별 매출·주문수 + 기간 합계·객단가 + 인기 상품.
// 매출 집계는 결제 승인 이후 상태(취소·미결제 제외).
const PAID_STATUSES = ["paid", "shipped", "delivered"];

export type SalesDayPoint = { date: string; sales: number; orders: number };
export type TopProduct = {
  productId: number;
  name: string;
  thumbnailKey: string | null;
  quantity: number;
  revenue: number;
};
export type SalesReport = {
  days: number;
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  daily: SalesDayPoint[];
  topProducts: TopProduct[];
};

// KST 날짜 문자열(YYYY-MM-DD) 배열 — 오늘 포함 과거 days일, 오름차순.
function recentKstDates(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(formatKstDate(new Date(now - i * 86400000)));
  }
  return out;
}

export async function getSalesReport(days = 30): Promise<SalesReport> {
  const since = new Date(Date.now() - days * 86400000);
  const orders = await db.order.findMany({
    where: { status: { in: PAID_STATUSES }, createdAt: { gte: since } },
    select: { id: true, totalAmount: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, { sales: number; orders: number }>();
  for (const d of recentKstDates(days)) byDay.set(d, { sales: 0, orders: 0 });
  let totalSales = 0;
  for (const o of orders) {
    const key = formatKstDate(o.createdAt);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.sales += o.totalAmount;
      bucket.orders += 1;
    }
    totalSales += o.totalAmount;
  }
  const daily: SalesDayPoint[] = [...byDay.entries()].map(([date, v]) => ({
    date,
    sales: v.sales,
    orders: v.orders,
  }));

  // 인기 상품 — 기간 내 결제 주문의 상품 합계(수량·매출) 상위 8.
  const orderIds = orders.map((o) => o.id);
  const topProducts: TopProduct[] = [];
  if (orderIds.length > 0) {
    const grouped = await db.orderItem.groupBy({
      by: ["productId", "productName", "productThumbnailKey"],
      where: { orderId: { in: orderIds } },
      _sum: { quantity: true },
    });
    // 매출은 unitPrice*quantity 합이 필요 — groupBy로 unitPrice가 섞이므로 별도 계산.
    const items = await db.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: { productId: true, unitPrice: true, quantity: true },
    });
    const revenueByProduct = new Map<number, number>();
    for (const it of items) {
      const pid = Number(it.productId);
      revenueByProduct.set(
        pid,
        (revenueByProduct.get(pid) ?? 0) + it.unitPrice * it.quantity,
      );
    }
    for (const g of grouped) {
      const pid = Number(g.productId);
      topProducts.push({
        productId: pid,
        name: g.productName,
        thumbnailKey: g.productThumbnailKey ?? null,
        quantity: g._sum.quantity ?? 0,
        revenue: revenueByProduct.get(pid) ?? 0,
      });
    }
    topProducts.sort((a, b) => b.revenue - a.revenue);
    topProducts.splice(8);
  }

  const totalOrders = orders.length;
  return {
    days,
    totalSales,
    totalOrders,
    avgOrderValue: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
    daily,
    topProducts,
  };
}
