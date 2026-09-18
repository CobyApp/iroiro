import "server-only";

import { env } from "@/lib/env";
import { MockPaymentGateway } from "./mock";
import type { PaymentGateway } from "./types";

/**
 * 활성 결제 게이트웨이를 반환한다. `PAYMENT_PROVIDER`로 어댑터를 선택.
 * 실 PG 추가 절차: lib/payments/toss.ts 구현 → 아래 case 추가 → env enum 확장.
 */
export function getPaymentGateway(): PaymentGateway {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
    default:
      return new MockPaymentGateway();
  }
}

export type {
  GatewayConfirmInput,
  GatewayConfirmResult,
  GatewayCancelInput,
  GatewayCancelResult,
  PaymentGateway,
} from "./types";
