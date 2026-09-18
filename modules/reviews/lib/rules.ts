import type { OrderStatus } from "@/modules/orders/types";

/**
 * 리뷰 가능 주문 상태 — 도착 인증이 취지라 발송 이후만 허용.
 * (delivered 전이가 아직 드물어 shipped도 포함 — 수취 후 작성 흐름.)
 */
export const REVIEWABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "shipped",
  "delivered",
];

export function canReviewOrderStatus(status: OrderStatus): boolean {
  return REVIEWABLE_ORDER_STATUSES.includes(status);
}

/** 리뷰어 이름 마스킹 — 입찰 내역과 동일한 규칙(첫 글자 + *). */
export function maskReviewerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return `${trimmed || "익명"}**`;
  return `${trimmed[0]}${"*".repeat(Math.min(trimmed.length - 1, 4))}`;
}

/** 평균 별점 — 소수 첫째 자리 반올림. 리뷰 없으면 null. */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}
