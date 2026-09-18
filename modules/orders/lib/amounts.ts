import type { DeliveryPolicy, OrderAmounts } from "../types";

/**
 * 주문 금액 단일 계산 지점 — 서버가 신뢰하는 유일한 금액 소스.
 * 클라이언트가 보낸 금액은 절대 신뢰하지 않고, 이 함수 결과와 대조(expectedTotalAmount)한다.
 *
 * 배송비 정책은 인자로 주입(순수 함수 유지 → 단위 테스트 용이). 정책 변경은
 * delivery_policy 행 수정만으로 반영된다.
 *
 *   productAmount  = Σ(unitPrice × quantity)
 *   discountAmount = 사용 포인트 (상품 금액까지로 clamp — 배송비엔 사용 불가)
 *   deliveryAmount = 무료배송 쿠폰 or 무료 기준 충족 시 0, 아니면 deliveryFee
 *   totalAmount    = productAmount − discountAmount + deliveryAmount
 */
export type OrderBenefits = {
  /** 사용 포인트(원 단위) — 호출 전 잔액 검증은 caller 책임. */
  pointsUsed?: number;
  /** 무료배송 쿠폰 적용 여부. */
  freeShippingCoupon?: boolean;
};

export function calculateOrderAmounts(
  items: Array<{ unitPrice: number; quantity: number }>,
  policy: DeliveryPolicy,
  benefits: OrderBenefits = {},
): OrderAmounts {
  const productAmount = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const discountAmount = Math.max(
    0,
    Math.min(benefits.pointsUsed ?? 0, productAmount),
  );
  const qualifiesForFreeDelivery =
    benefits.freeShippingCoupon === true ||
    (policy.freeThresholdAmount !== null &&
      productAmount >= policy.freeThresholdAmount);
  const deliveryAmount = qualifiesForFreeDelivery ? 0 : policy.deliveryFee;
  const totalAmount = productAmount - discountAmount + deliveryAmount;

  return { productAmount, discountAmount, deliveryAmount, totalAmount };
}
