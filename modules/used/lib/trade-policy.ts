// 중고 안전거래 상태 전이·환불·타이머 판정 — 순수 함수(서버·클라 공용, DB 접근 없음).
// 상태: pending → paid → (택배 shipped | 직거래 handed_over) → completed. 분쟁 disputed, 환불 refunded, 취소 canceled.
// 모든 실제 전이는 액션에서 조건부 updateMany 로 멱등 처리하고, 여기선 "지금 이 동작이 허용되는가"만 답한다.

import type { UsedTradeKind, UsedTradeStatus } from "../types";

// 타이머 창(밀리초).
export const PARCEL_AUTO_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000; // 발송 후 7일
export const DIRECT_AUTO_CONFIRM_MS = 3 * 24 * 60 * 60 * 1000; // 대면 전달 후 3일
export const DIRECT_AUTO_REFUND_MS = 14 * 24 * 60 * 60 * 1000; // 결제 후 14일 미전달 시 구매자 자동환불

export const PARCEL_AUTO_CONFIRM_DAYS = Math.round(PARCEL_AUTO_CONFIRM_MS / 86_400_000);
export const DIRECT_AUTO_CONFIRM_DAYS = Math.round(DIRECT_AUTO_CONFIRM_MS / 86_400_000);
export const DIRECT_AUTO_REFUND_DAYS = Math.round(DIRECT_AUTO_REFUND_MS / 86_400_000);

// 결제완료 후 아직 발송/전달 전이면 양측 모두 취소=환불 가능(오간 물건 없음).
export function canBuyerCancelForRefund(status: UsedTradeStatus): boolean {
  return status === "paid";
}
export function canSellerCancelForRefund(status: UsedTradeStatus): boolean {
  return status === "paid";
}

// 판매자 발송 표시(택배) — 결제완료에서만.
export function canSellerShip(kind: UsedTradeKind, status: UsedTradeStatus): boolean {
  return kind === "parcel" && status === "paid";
}

// 판매자 대면 전달 표시(직거래) — 결제완료에서만. 이후 자동확정 타이머(3일)의 기준.
export function canSellerMarkHandedOver(kind: UsedTradeKind, status: UsedTradeStatus): boolean {
  return kind === "direct" && status === "paid";
}

// 구매자 수령확정 — 택배는 발송 후, 직거래는 결제완료(만나서 받음) 또는 전달표시 후.
export function canBuyerConfirm(kind: UsedTradeKind, status: UsedTradeStatus): boolean {
  if (kind === "parcel") return status === "shipped";
  return status === "paid" || status === "handed_over";
}

// 분쟁 접수 — 발송/전달 후 완료 전에만(하자·미도착 등). 결제 전/후 미발송은 취소로.
export function canBuyerDispute(kind: UsedTradeKind, status: UsedTradeStatus): boolean {
  if (kind === "parcel") return status === "shipped";
  return status === "handed_over";
}

type TimerRow = {
  status: UsedTradeStatus;
  shippedAt: Date | null;
  handedOverAt: Date | null;
};

// 자동확정 대상? 택배=발송 7일, 직거래=전달 3일. 기준 시각이 NULL 이면 대상 아님(안전).
export function isAutoConfirmDue(kind: UsedTradeKind, row: TimerRow, now: Date): boolean {
  if (kind === "parcel") {
    if (row.status !== "shipped" || !row.shippedAt) return false;
    return now.getTime() - row.shippedAt.getTime() >= PARCEL_AUTO_CONFIRM_MS;
  }
  if (row.status !== "handed_over" || !row.handedOverAt) return false;
  return now.getTime() - row.handedOverAt.getTime() >= DIRECT_AUTO_CONFIRM_MS;
}

type RefundTimerRow = {
  status: UsedTradeStatus;
  tradeKind: UsedTradeKind;
  handedOverAt: Date | null;
  createdAt: Date; // 결제 시각 근사(거래 생성 직후 결제).
};

// 직거래 자동환불 대상? 전달표시 없이 결제완료로 14일 방치 → 구매자 보호(자동 환불).
export function isDirectAutoRefundDue(row: RefundTimerRow, now: Date): boolean {
  if (row.tradeKind !== "direct") return false;
  if (row.status !== "paid" || row.handedOverAt) return false;
  return now.getTime() - row.createdAt.getTime() >= DIRECT_AUTO_REFUND_MS;
}
