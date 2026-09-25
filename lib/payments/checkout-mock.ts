import "server-only";

import { v7 as uuidv7 } from "uuid";

import type {
  CheckoutApproveInput,
  CheckoutApproveResult,
  CheckoutProvider,
  CheckoutReadyInput,
  CheckoutReadyResult,
  CheckoutRefundInput,
  CheckoutRefundResult,
} from "./checkout-types";

/**
 * 모의 리다이렉트 결제 어댑터 — 실 PG 연동 전 기본값(kind="immediate").
 * 실 HTTP 호출이 전혀 없어 CI·로컬에서 안전하다. 도메인은 kind 를 보고
 * ready/approve 를 건너뛰고 즉시 결제완료로 처리한다. 아래 메서드는 계약 완결성과
 * 테스트를 위해 구현만 해두며, immediate 경로에서는 호출되지 않는다.
 */
export class MockCheckoutProvider implements CheckoutProvider {
  readonly provider = "mock";
  readonly kind = "immediate" as const;

  async ready(input: CheckoutReadyInput): Promise<CheckoutReadyResult> {
    const tid = `mock_${uuidv7()}`;
    return {
      ok: true,
      tid,
      // 실 PG 없이도 흐름을 이어보려면 승인 URL 로 바로 되돌린다(가짜 pg_token).
      redirectUrl: `${input.approvalUrl}${input.approvalUrl.includes("?") ? "&" : "?"}pg_token=mock_pg_token`,
      raw: { provider: this.provider, orderNo: input.orderNo, tid },
    };
  }

  async approve(input: CheckoutApproveInput): Promise<CheckoutApproveResult> {
    return {
      ok: true,
      approvedAmount: 0,
      approvedAt: new Date().toISOString(),
      raw: { provider: this.provider, tid: input.tid, pgToken: input.pgToken },
    };
  }

  async refund(input: CheckoutRefundInput): Promise<CheckoutRefundResult> {
    // 실 HTTP 없이 항상 성공 — 개발/폴백 환불.
    return {
      ok: true,
      canceledAmount: input.amount,
      raw: { provider: this.provider, tid: input.tid, reason: input.reason ?? null },
    };
  }
}
