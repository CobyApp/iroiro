/**
 * 리다이렉트형 결제 포트 — 중고 안전거래(에스크로) 체크아웃용.
 *
 * modules/orders 의 confirm/cancel(동기 승인) 게이트웨이(types.ts)와 별개의 계약이다.
 * 카카오페이·토스페이 등 "준비(ready) → 사용자 승인 → 승인(approve)" 2단계 리다이렉트
 * PG 를 이 인터페이스 뒤에 둔다. mock(즉시 결제) ↔ 실 PG 교체는 어댑터만 바꾸고
 * PAYMENT_PROVIDER 로 선택한다. 도메인(modules/used)은 이 계약만 안다.
 *
 * 타입 전용 파일 — "server-only" import 금지(클라이언트가 타입만 참조할 수 있어야 함).
 */

export type CheckoutReadyInput = {
  /** 가맹점 주문번호(partner_order_id). 예: "used-123". */
  orderNo: string;
  /** 가맹점 회원 식별자(partner_user_id). 승인 시 동일 값이어야 한다 — 구매자 account.id. */
  userId: string;
  /** 결제창에 표시할 상품명. */
  itemName: string;
  /** 수량. */
  quantity: number;
  /** 실제 청구 금액(원). */
  totalAmount: number;
  /** 승인 리다이렉트 URL — 여기로 pg_token 이 붙어 돌아온다. */
  approvalUrl: string;
  /** 사용자가 결제를 취소했을 때 이동할 URL. */
  cancelUrl: string;
  /** 결제가 실패했을 때 이동할 URL. */
  failUrl: string;
  /**
   * 모바일 기기 여부 — 카카오페이가 PC(QR) 대신 카카오톡 앱 연동 결제창으로 보내도록.
   * 미지정이면 PC(QR)로 폴백. 서버 액션에서 isMobileFromHeaders()로 채운다.
   */
  isMobile?: boolean;
};

export type CheckoutReadyResult =
  | {
      ok: true;
      /** 결제 거래번호 — 승인 단계에서 그대로 사용한다(카카오 tid 대응). */
      tid: string;
      /** 사용자를 보낼 결제 페이지 URL(next_redirect_pc_url 대응). */
      redirectUrl: string;
      raw: unknown;
    }
  | { ok: false; failMessage: string; raw: unknown };

export type CheckoutApproveInput = {
  tid: string;
  orderNo: string;
  userId: string;
  /** 승인 리다이렉트로 돌아온 결제 승인 토큰. */
  pgToken: string;
};

export type CheckoutApproveResult =
  | {
      ok: true;
      approvedAmount: number;
      approvedAt: string; // ISO 8601
      raw: unknown;
    }
  | { ok: false; failMessage: string; raw: unknown };

export type CheckoutRefundInput = {
  /** 승인 때 받은 결제 거래번호(카카오 tid). */
  tid: string;
  /** 가맹점 주문번호(partner_order_id). 예: "used-123". */
  orderNo: string;
  /** 환불(취소) 금액(원). 부분취소 미지원 — 전액취소로만 쓴다. */
  amount: number;
  /** 취소 사유(기록용). */
  reason?: string;
};

export type CheckoutRefundResult =
  | { ok: true; canceledAmount: number; raw: unknown }
  | { ok: false; failMessage: string; raw: unknown };

export interface CheckoutProvider {
  /** 어댑터 식별자(로그·기록용). */
  readonly provider: string;
  /**
   * immediate — 리다이렉트 없이 즉시 결제완료로 취급(mock). 도메인이 ready/approve 를
   *             호출하지 않고 곧바로 거래를 paid 로 만든다.
   * redirect  — ready → 사용자 승인 → approve 2단계. 도메인이 pending 거래를 만들고
   *             redirectUrl 로 보낸다.
   */
  readonly kind: "immediate" | "redirect";
  ready(input: CheckoutReadyInput): Promise<CheckoutReadyResult>;
  approve(input: CheckoutApproveInput): Promise<CheckoutApproveResult>;
  /**
   * 승인된 결제를 취소(환불)한다 — 안전거래 환불에 쓴다. 전액취소만 지원.
   * mock 은 항상 성공, 실 PG 는 취소 API 를 호출한다.
   */
  refund(input: CheckoutRefundInput): Promise<CheckoutRefundResult>;
}
