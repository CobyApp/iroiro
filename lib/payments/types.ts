/**
 * 결제 게이트웨이 포트 — PG를 이 인터페이스 뒤에 둔다.
 * mock ↔ 실 PG(Toss 등) 교체는 어댑터 구현만 바꾸고 `PAYMENT_PROVIDER`로 선택한다.
 * 도메인(modules/orders)은 이 계약만 알고 구체 PG는 모른다.
 *
 * 타입 전용 파일 — "server-only" import 금지(클라이언트가 타입만 참조할 수 있어야 함).
 */

export type GatewayConfirmInput = {
  /** 주문번호. Toss orderId 대응. */
  orderNo: string;
  /** 승인 요청 금액(원). 서버가 계산한 order.totalAmount. */
  amount: number;
  /** 거래번호. Toss paymentKey 대응. 없으면(null) 어댑터가 자체 발급. */
  tradeNo: string | null;
};

export type GatewayConfirmResult =
  | {
      ok: true;
      tradeNo: string;
      method: string;
      approvedAmount: number;
      approvedAt: string; // ISO 8601
      rawRequest: unknown;
      rawResponse: unknown;
    }
  | {
      ok: false;
      failMessage: string;
      rawRequest: unknown;
      rawResponse: unknown;
    };

export type GatewayCancelInput = {
  tradeNo: string;
  reason: string;
};

export type GatewayCancelResult =
  | { ok: true; canceledAt: string; rawResponse: unknown }
  | { ok: false; failMessage: string; rawResponse: unknown };

export interface PaymentGateway {
  /** 어댑터 식별자. payment.provider에 저장된다. */
  readonly provider: string;

  /** 결제 승인. Toss POST /v1/payments/confirm 대응. 반드시 DB 트랜잭션 밖에서 호출. */
  confirm(input: GatewayConfirmInput): Promise<GatewayConfirmResult>;

  /** 결제 취소(환불). 실 PG 도입 시 사용 — mock은 즉시 성공. */
  cancel(input: GatewayCancelInput): Promise<GatewayCancelResult>;
}
