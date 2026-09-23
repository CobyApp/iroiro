import "server-only";

import { db } from "@/lib/db";
import type { OrderStatus } from "../types";

export type AdminOrderRow = {
  id: number;
  orderNo: string;
  status: OrderStatus;
  productAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  itemCount: number;
  firstItemName: string | null;
  recipientName: string | null;
  buyerName: string;
  trackingCode: string | null;
  courier: string | null;
  createdAt: string;
};

/** 관리자 주문 목록 — 최신순, 상태 필터, 구매자·수령인 표시. */
export async function listOrdersForAdmin(
  status?: OrderStatus,
  limit = 100,
): Promise<AdminOrderRow[]> {
  const orders = await db.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const accountIds = [...new Set(orders.map((o) => o.accountId))];
  const [items, addresses, accounts] = await Promise.all([
    db.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { id: "asc" },
      select: { orderId: true, productName: true },
    }),
    db.orderAddress.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, recipientName: true },
    }),
    db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, displayName: true },
    }),
  ]);

  const itemsByOrder = new Map<bigint, string[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item.productName);
    itemsByOrder.set(item.orderId, list);
  }
  const recipientByOrder = new Map(
    addresses.map((a) => [a.orderId, a.recipientName]),
  );
  const nameByAccount = new Map(accounts.map((a) => [a.id, a.displayName]));

  return orders.map((order) => {
    const names = itemsByOrder.get(order.id) ?? [];
    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      status: order.status as OrderStatus,
      productAmount: order.productAmount,
      discountAmount: order.discountAmount,
      deliveryAmount: order.deliveryAmount,
      totalAmount: order.totalAmount,
      itemCount: names.length,
      firstItemName: names[0] ?? null,
      recipientName: recipientByOrder.get(order.id) ?? null,
      buyerName: nameByAccount.get(order.accountId) ?? "알 수 없음",
      trackingCode: order.trackingCode ?? null,
      courier: order.courier ?? null,
      createdAt: order.createdAt.toISOString(),
    };
  });
}
