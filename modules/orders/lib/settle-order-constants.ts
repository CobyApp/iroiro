// 스토어 주문 자동 수령확정 상수 — 서버·클라이언트 공용(순수 값이라 "server-only" 아님).
// server 로직은 settle-order.ts, 클라이언트 문구(OrderReceiptConfirm)는 여기서 값을 읽는다.

export const ORDER_AUTO_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000; // 발송 후 7일
export const ORDER_AUTO_CONFIRM_DAYS = Math.round(
  ORDER_AUTO_CONFIRM_MS / (24 * 60 * 60 * 1000),
);
