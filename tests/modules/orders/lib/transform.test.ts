import { describe, expect, it } from "vitest";
import type {
  Order as PrismaOrder,
  OrderAddress as PrismaOrderAddress,
  OrderItem as PrismaOrderItem,
  Payment as PrismaPayment,
} from "@prisma/client";
import {
  toOrder,
  toOrderAddress,
  toOrderItem,
  toPayment,
} from "@/modules/orders/lib/transform";

const CREATED = new Date("2026-07-04T05:00:00Z");

describe("toOrder", () => {
  it("BigInt id를 number로, Date를 ISO 문자열로 변환한다", () => {
    const row: PrismaOrder = {
      id: 42n,
      orderNo: "20260704-ABCDEF1234",
      accountId: "acc-1",
      status: "pending",
      productAmount: 10000,
      discountAmount: 0,
      deliveryAmount: 3000,
      totalAmount: 13000,
      trackingCode: null,
      courier: null,
      shippedAt: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    };
    const dto = toOrder(row);
    expect(dto.id).toBe(42);
    expect(dto.orderNo).toBe("20260704-ABCDEF1234");
    expect(dto.status).toBe("pending");
    expect(dto.totalAmount).toBe(13000);
    expect(dto.createdAt).toBe(CREATED.toISOString());
  });
});

describe("toOrderItem", () => {
  it("스냅샷 필드와 nullable을 그대로 매핑한다", () => {
    const row: PrismaOrderItem = {
      id: 1n,
      orderId: 42n,
      productId: 7n,
      productName: "포토카드",
      productThumbnailKey: null,
      itemType: "photocard",
      condition: "good",
      unitPrice: 10000,
      quantity: 2,
      createdAt: CREATED,
    };
    const dto = toOrderItem(row);
    expect(dto.orderId).toBe(42);
    expect(dto.productId).toBe(7);
    expect(dto.productThumbnailKey).toBeNull();
    expect(dto.condition).toBe("good");
    expect(dto.unitPrice).toBe(10000);
    expect(dto.quantity).toBe(2);
  });
});

describe("toOrderAddress", () => {
  it("optional 주소 필드를 매핑한다", () => {
    const row: PrismaOrderAddress = {
      id: 1n,
      orderId: 42n,
      accountId: "acc-1",
      recipientName: "홍길동",
      recipientPhone: "010-0000-0000",
      zipcode: "06236",
      baseAddress: "서울시 강남구",
      detailAddress: null,
      deliveryMessage: "문 앞",
      createdAt: CREATED,
    };
    const dto = toOrderAddress(row);
    expect(dto.recipientName).toBe("홍길동");
    expect(dto.zipcode).toBe("06236");
    expect(dto.detailAddress).toBeNull();
    expect(dto.deliveryMessage).toBe("문 앞");
  });
});

describe("toPayment", () => {
  it("nullable 시각·금액을 매핑한다(미승인)", () => {
    const row: PrismaPayment = {
      id: 1n,
      orderId: 42n,
      accountId: "acc-1",
      orderNo: "20260704-ABCDEF1234",
      provider: "mock",
      method: null,
      status: "ready",
      requestedAmount: 13000,
      approvedAmount: null,
      tradeNo: null,
      approvedAt: null,
      canceledAt: null,
      failMessage: null,
      rawRequest: null,
      rawResponse: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    };
    const dto = toPayment(row);
    expect(dto.status).toBe("ready");
    expect(dto.approvedAmount).toBeNull();
    expect(dto.approvedAt).toBeNull();
    // DTO는 raw_request/raw_response를 노출하지 않는다(민감 데이터).
    expect(dto).not.toHaveProperty("rawRequest");
  });

  it("승인된 결제의 시각을 ISO로 변환한다", () => {
    const approvedAt = new Date("2026-07-04T05:01:00Z");
    const row: PrismaPayment = {
      id: 1n,
      orderId: 42n,
      accountId: "acc-1",
      orderNo: "20260704-ABCDEF1234",
      provider: "mock",
      method: "card",
      status: "approved",
      requestedAmount: 13000,
      approvedAmount: 13000,
      tradeNo: "mock_abc",
      approvedAt,
      canceledAt: null,
      failMessage: null,
      rawRequest: {},
      rawResponse: {},
      createdAt: CREATED,
      updatedAt: CREATED,
    };
    const dto = toPayment(row);
    expect(dto.status).toBe("approved");
    expect(dto.approvedAmount).toBe(13000);
    expect(dto.tradeNo).toBe("mock_abc");
    expect(dto.approvedAt).toBe(approvedAt.toISOString());
  });
});
