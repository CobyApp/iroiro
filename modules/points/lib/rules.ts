/** 가입 웰컴 포인트. */
export const WELCOME_POINTS = 1000;
/** 가입 웰컴 무료배송 쿠폰 장수. */
export const WELCOME_FREE_SHIPPING_COUPONS = 3;
/** 친구 초대 보상 — 초대한 쪽·가입한 쪽 각각. */
export const REFERRAL_POINTS = 500;
/** 도착 인증 리뷰 첫 작성 적립 — 주문×상품당 1회. */
export const REVIEW_POINTS = 100;

export const POINT_REASON_LABEL = {
  welcome: "가입 축하",
  order_use: "주문 사용",
  order_refund: "주문 취소 환급",
  review: "리뷰 작성",
  referral: "친구 초대",
  admin: "운영자 지급",
} as const satisfies Record<string, string>;

export type PointReason = keyof typeof POINT_REASON_LABEL;

/**
 * 이번 주문에 쓸 수 있는 최대 포인트 — 보유 잔액과 상품 금액 중 작은 쪽.
 * (배송비에는 사용 불가 — 할인은 상품 금액까지만.)
 */
export function maxUsablePoints(
  balance: number,
  productAmount: number,
): number {
  return Math.max(0, Math.min(balance, productAmount));
}

/** 쿠폰 사용 가능 여부 — 미사용 + 만료 전. */
export function isCouponUsable(
  coupon: { usedAt: string | null; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  if (coupon.usedAt !== null) return false;
  if (coupon.expiresAt !== null && new Date(coupon.expiresAt) <= now)
    return false;
  return true;
}
