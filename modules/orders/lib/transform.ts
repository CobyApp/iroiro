import "server-only";

import type {
  Order as PrismaOrder,
  OrderAddress as PrismaOrderAddress,
  OrderItem as PrismaOrderItem,
  Payment as PrismaPayment,
} from "@prisma/client";
import type {
  Order,
  OrderAddress,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentStatus,
} from "../types";

// status는 DB에 TEXT로 저장되지만 쓰기를 우리가 통제하므로 union으로 캐스팅.
export function toOrder(row: PrismaOrder): Order {
  return {
    id: Number(row.id),
    orderNo: row.orderNo,
    accountId: row.accountId,
    status: row.status as OrderStatus,
    productAmount: row.productAmount,
    discountAmount: row.discountAmount,
    deliveryAmount: row.deliveryAmount,
    totalAmount: row.totalAmount,
    trackingCode: row.trackingCode ?? null,
    shippedAt: row.shippedAt ? row.shippedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toOrderItem(row: PrismaOrderItem): OrderItem {
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    productId: Number(row.productId),
    productName: row.productName,
    productThumbnailKey: row.productThumbnailKey,
    itemType: row.itemType,
    condition: row.condition,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toOrderAddress(row: PrismaOrderAddress): OrderAddress {
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    zipcode: row.zipcode,
    baseAddress: row.baseAddress,
    detailAddress: row.detailAddress,
    deliveryMessage: row.deliveryMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPayment(row: PrismaPayment): Payment {
  return {
    id: Number(row.id),
    orderId: Number(row.orderId),
    orderNo: row.orderNo,
    provider: row.provider,
    method: row.method,
    status: row.status as PaymentStatus,
    requestedAmount: row.requestedAmount,
    approvedAmount: row.approvedAmount,
    tradeNo: row.tradeNo,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
    failMessage: row.failMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
