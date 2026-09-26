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
  firstItemProductId: number | null;
  firstItemThumbnailKey: string | null;
  recipientName: string | null;
  buyerAccountId: string;
  buyerName: string;
  trackingCode: string | null;
  courier: string | null;
  createdAt: string;
};

export type AdminOrderPage = {
  items: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
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
  buyerAccountId: string;
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
    buyerAccountId: order.accountId,
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

/** 관리자 주문 목록 — 최신순, 상태 필터, 페이지네이션. 구매자·수령인·대표 썸네일 포함. */
export async function listOrdersForAdmin(
  status: OrderStatus | undefined,
  page = 1,
  pageSize = 20,
): Promise<AdminOrderPage> {
  const where = status ? { status } : undefined;
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  if (orders.length === 0) {
    return { items: [], total, page, pageSize };
  }

  const orderIds = orders.map((o) => o.id);
  const accountIds = [...new Set(orders.map((o) => o.accountId))];
  const [items, addresses, accounts] = await Promise.all([
    db.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { id: "asc" },
      select: {
        orderId: true,
        productId: true,
        productName: true,
        productThumbnailKey: true,
      },
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

  type FirstItem = { name: string; productId: number; thumb: string | null };
  const itemsByOrder = new Map<bigint, { count: number; first: FirstItem }>();
  for (const item of items) {
    const cur = itemsByOrder.get(item.orderId);
    if (cur) {
      cur.count += 1;
    } else {
      itemsByOrder.set(item.orderId, {
        count: 1,
        first: {
          name: item.productName,
          productId: Number(item.productId),
          thumb: item.productThumbnailKey ?? null,
        },
      });
    }
  }
  const recipientByOrder = new Map(
    addresses.map((a) => [a.orderId, a.recipientName]),
  );
  const nameByAccount = new Map(accounts.map((a) => [a.id, a.displayName]));

  const rows: AdminOrderRow[] = orders.map((order) => {
    const agg = itemsByOrder.get(order.id);
    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      status: order.status as OrderStatus,
      productAmount: order.productAmount,
      discountAmount: order.discountAmount,
      deliveryAmount: order.deliveryAmount,
      totalAmount: order.totalAmount,
      itemCount: agg?.count ?? 0,
      firstItemName: agg?.first.name ?? null,
      firstItemProductId: agg?.first.productId ?? null,
      firstItemThumbnailKey: agg?.first.thumb ?? null,
      recipientName: recipientByOrder.get(order.id) ?? null,
      buyerAccountId: order.accountId,
      buyerName: nameByAccount.get(order.accountId) ?? "알 수 없음",
      trackingCode: order.trackingCode ?? null,
      courier: order.courier ?? null,
      createdAt: order.createdAt.toISOString(),
    };
  });
  return { items: rows, total, page, pageSize };
}
