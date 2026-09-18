import "server-only";

import { v7 as uuidv7 } from "uuid";

import type {
  GatewayCancelInput,
  GatewayCancelResult,
  GatewayConfirmInput,
  GatewayConfirmResult,
  PaymentGateway,
} from "./types";

/**
 * 모의 결제 게이트웨이 — 실 PG 연동 전까지 기본 어댑터.
 * 항상 동기적으로 승인하되, tradeNo가 마법값이면 거절한다(개발·테스트용).
 * raw_request/raw_response JSONB 컬럼을 실제로 채워 실 PG 스키마 매핑을 미리 검증.
 */

// 이 tradeNo로 confirm하면 승인 거절 — dev 결제 페이지의 "실패 테스트" 버튼과 테스트가 사용.
// (Stripe 테스트 카드 4000…0002 = 거절 관례를 tradeNo 마법값으로 옮긴 것.)
export const MOCK_FAIL_TRADE_NO = "mock_fail";

export class MockPaymentGateway implements PaymentGateway {
  readonly provider = "mock";

  async confirm(input: GatewayConfirmInput): Promise<GatewayConfirmResult> {
    const rawRequest = {
      provider: this.provider,
      orderNo: input.orderNo,
      amount: input.amount,
      tradeNo: input.tradeNo,
    };

    if (input.tradeNo === MOCK_FAIL_TRADE_NO) {
      return {
        ok: false,
        failMessage: "모의 결제가 거절되었습니다",
        rawRequest,
        rawResponse: { status: "DENIED", code: "MOCK_DENIED" },
      };
    }

    const tradeNo = input.tradeNo ?? `mock_${uuidv7()}`;
    const approvedAt = new Date().toISOString();
    return {
      ok: true,
      tradeNo,
      method: "card",
      approvedAmount: input.amount,
      approvedAt,
      rawRequest,
      rawResponse: {
        status: "DONE",
        tradeNo,
        method: "card",
        approvedAmount: input.amount,
        approvedAt,
      },
    };
  }

  async cancel(input: GatewayCancelInput): Promise<GatewayCancelResult> {
    const canceledAt = new Date().toISOString();
    return {
      ok: true,
      canceledAt,
      rawResponse: {
        status: "CANCELED",
        tradeNo: input.tradeNo,
        reason: input.reason,
        canceledAt,
      },
    };
  }
}
