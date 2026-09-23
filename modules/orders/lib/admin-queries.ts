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

export type AdminOrderItem = {
  id: number;
  productId: number;
  productName: string;
  productThumbnailKey: string | null;
  unitPrice: number;
  quantity: number;
};

export type AdminOrderDetail = {
  id: number;
  orderNo: string;
  status: OrderStatus;
  productAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  buyerName: string;
  trackingCode: string | null;
  courier: string | null;
  shippedAt: string | null;
  createdAt: string;
  items: AdminOrderItem[];
  address: {
    recipientName: string;
    recipientPhone: string;
    zipcode: string;
    baseAddress: string;
    detailAddress: string | null;
    deliveryMessage: string | null;
  } | null;
  payment: {
    provider: string;
    method: string | null;
    status: string;
    approvedAmount: number | null;
    approvedAt: string | null;
  } | null;
};

/** 관리자 주문 상세 — 계정 스코프 없음(관리자 전용 라우트가 가드). 상품 이미지 포함. */
export async function getAdminOrderDetail(
  orderNo: string,
): Promise<AdminOrderDetail | null> {
  const order = await db.order.findFirst({ where: { orderNo } });
  if (!order) return null;

  const [items, address, account, payment] = await Promise.all([
    db.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { id: "asc" },
    }),
    db.orderAddress.findFirst({ where: { orderId: order.id } }),
    db.account.findUnique({
      where: { id: order.accountId },
      select: { displayName: true },
    }),
    db.payment.findFirst({ where: { orderId: order.id } }),
  ]);

  return {
    id: Number(order.id),
    orderNo: order.orderNo,
    status: order.status as OrderStatus,
    productAmount: order.productAmount,
    discountAmount: order.discountAmount,
    deliveryAmount: order.deliveryAmount,
    totalAmount: order.totalAmount,
    buyerName: account?.displayName ?? "알 수 없음",
    trackingCode: order.trackingCode ?? null,
    courier: order.courier ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    items: items.map((i) => ({
      id: Number(i.id),
      productId: Number(i.productId),
      productName: i.productName,
      productThumbnailKey: i.productThumbnailKey ?? null,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
    address: address
      ? {
          recipientName: address.recipientName,
          recipientPhone: address.recipientPhone,
          zipcode: address.zipcode,
          baseAddress: address.baseAddress,
          detailAddress: address.detailAddress ?? null,
          deliveryMessage: address.deliveryMessage ?? null,
        }
      : null,
    payment: payment
      ? {
          provider: payment.provider,
          method: payment.method ?? null,
          status: payment.status,
          approvedAmount: payment.approvedAmount ?? null,
          approvedAt: payment.approvedAt?.toISOString() ?? null,
        }
      : null,
  };
}

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
