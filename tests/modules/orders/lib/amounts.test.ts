import { describe, expect, it } from "vitest";
import { calculateOrderAmounts } from "@/modules/orders/lib/amounts";
import type { DeliveryPolicy } from "@/modules/orders/types";

const feeOnly: DeliveryPolicy = { deliveryFee: 3000, freeThresholdAmount: null };
const withThreshold: DeliveryPolicy = {
  deliveryFee: 3000,
  freeThresholdAmount: 50000,
};

describe("calculateOrderAmounts", () => {
  it("여러 아이템의 unitPrice×quantity를 합산한다", () => {
    const result = calculateOrderAmounts(
      [
        { unitPrice: 10000, quantity: 2 },
        { unitPrice: 5000, quantity: 1 },
      ],
      feeOnly,
    );
    expect(result.productAmount).toBe(25000);
  });

  it("무료 기준이 null이면 항상 배송비를 부과한다", () => {
    const result = calculateOrderAmounts(
      [{ unitPrice: 1000000, quantity: 1 }],
      feeOnly,
    );
    expect(result.deliveryAmount).toBe(3000);
    expect(result.totalAmount).toBe(1003000);
  });

  it("상품 합계가 무료 기준 미만이면 배송비를 부과한다", () => {
    const result = calculateOrderAmounts(
      [{ unitPrice: 42000, quantity: 1 }],
      withThreshold,
    );
    expect(result.deliveryAmount).toBe(3000);
    expect(result.totalAmount).toBe(45000);
  });

  it("상품 합계가 무료 기준 이상이면 배송비가 0이다(경계값 포함)", () => {
    const exact = calculateOrderAmounts(
      [{ unitPrice: 50000, quantity: 1 }],
      withThreshold,
    );
    expect(exact.deliveryAmount).toBe(0);
    expect(exact.totalAmount).toBe(50000);

    const over = calculateOrderAmounts(
      [{ unitPrice: 55000, quantity: 1 }],
      withThreshold,
    );
    expect(over.deliveryAmount).toBe(0);
    expect(over.totalAmount).toBe(55000);
  });

  it("benefits 없으면 discountAmount는 0이다", () => {
    const result = calculateOrderAmounts(
      [{ unitPrice: 10000, quantity: 1 }],
      feeOnly,
    );
    expect(result.discountAmount).toBe(0);
  });

  it("포인트 사용은 discountAmount로 반영되고 상품 금액까지로 clamp된다", () => {
    const used = calculateOrderAmounts(
      [{ unitPrice: 10000, quantity: 1 }],
      feeOnly,
      { pointsUsed: 3000 },
    );
    expect(used.discountAmount).toBe(3000);
    expect(used.totalAmount).toBe(10000 - 3000 + 3000);

    const over = calculateOrderAmounts(
      [{ unitPrice: 10000, quantity: 1 }],
      feeOnly,
      { pointsUsed: 99999 },
    );
    expect(over.discountAmount).toBe(10000);
    // 포인트는 배송비에 못 쓴다 — 전액 사용해도 배송비는 남는다.
    expect(over.totalAmount).toBe(3000);

    const negative = calculateOrderAmounts(
      [{ unitPrice: 10000, quantity: 1 }],
      feeOnly,
      { pointsUsed: -500 },
    );
    expect(negative.discountAmount).toBe(0);
  });

  it("무료배송 쿠폰은 배송비만 0으로 만든다", () => {
    const result = calculateOrderAmounts(
      [{ unitPrice: 10000, quantity: 1 }],
      feeOnly,
      { freeShippingCoupon: true },
    );
    expect(result.deliveryAmount).toBe(0);
    expect(result.totalAmount).toBe(10000);
  });

  it("포인트 + 쿠폰 동시 사용", () => {
    const result = calculateOrderAmounts(
      [{ unitPrice: 20000, quantity: 1 }],
      feeOnly,
      { pointsUsed: 5000, freeShippingCoupon: true },
    );
    expect(result.totalAmount).toBe(15000);
  });

  it("totalAmount = productAmount − discountAmount + deliveryAmount", () => {
    const result = calculateOrderAmounts(
      [{ unitPrice: 12000, quantity: 3 }],
      feeOnly,
    );
    expect(result.totalAmount).toBe(
      result.productAmount - result.discountAmount + result.deliveryAmount,
    );
  });
});
