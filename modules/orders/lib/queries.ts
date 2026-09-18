import "server-only";

import { db } from "@/lib/db";
import {
  toOrder,
  toOrderAddress,
  toOrderItem,
  toPayment,
} from "./transform";
import type {
  DeliveryPolicy,
  OrderDetail,
  OrderItem as OrderItemDto,
  OrderSummary,
} from "../types";

/** 배송비 정책(singleton 1행). 없으면 설정 오류로 fail-fast. */
export async function getDeliveryPolicy(): Promise<DeliveryPolicy> {
  const row = await db.deliveryPolicy.findUnique({ where: { id: BigInt(1) } });
  if (!row) throw new Error("배송비 정책이 설정되지 않았습니다");
  return {
    deliveryFee: row.deliveryFee,
    freeThresholdAmount: row.freeThresholdAmount,
  };
}

/** 본인 주문 상세(아이템 스냅샷·배송지·결제). accountId 스코프 — orderNo 단독 조회 금지. */
export async function getOrderByOrderNo(
  accountId: string,
  orderNo: string,
): Promise<OrderDetail | null> {
  const orderRow = await db.order.findFirst({ where: { orderNo, accountId } });
  if (!orderRow) return null;

  const [itemRows, addressRow, paymentRow] = await Promise.all([
    db.orderItem.findMany({
      where: { orderId: orderRow.id },
      orderBy: { id: "asc" },
    }),
    db.orderAddress.findUnique({ where: { orderId: orderRow.id } }),
    db.payment.findUnique({ where: { orderId: orderRow.id } }),
  ]);

  return {
    ...toOrder(orderRow),
    items: itemRows.map(toOrderItem),
    address: addressRow ? toOrderAddress(addressRow) : null,
    payment: paymentRow ? toPayment(paymentRow) : null,
  };
}

/** 본인 주문 목록(최신순). 대표 상품명 + 종류 수 포함. */
export async function listOrdersByAccount(
  accountId: string,
): Promise<OrderSummary[]> {
  const orderRows = await db.order.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
  const orderIds = orderRows.map((order) => order.id);
  const itemRows = orderIds.length
    ? await db.orderItem.findMany({
        where: { orderId: { in: orderIds } },
        orderBy: { id: "asc" },
      })
    : [];

  const itemsByOrder = new Map<number, OrderItemDto[]>();
  for (const row of itemRows) {
    const orderId = Number(row.orderId);
    const list = itemsByOrder.get(orderId) ?? [];
    list.push(toOrderItem(row));
    itemsByOrder.set(orderId, list);
  }

  return orderRows.map((row) => {
    const order = toOrder(row);
    const items = itemsByOrder.get(order.id) ?? [];
    return {
      ...order,
      itemCount: items.length,
      firstItemName: items[0]?.productName ?? null,
    };
  });
}
