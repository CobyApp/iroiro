import "server-only";

import { env } from "@/lib/env";
import { MockCheckoutProvider } from "./checkout-mock";
import { KakaoPayCheckoutProvider } from "./kakaopay";
import type { CheckoutProvider } from "./checkout-types";

/**
 * 활성 리다이렉트 결제 어댑터를 반환한다(중고 안전거래 체크아웃).
 * PAYMENT_PROVIDER 로 선택하되, kakaopay 라도 KAKAO_PAY_SECRET_KEY 가 없으면
 * mock(즉시 결제)으로 폴백한다 — 키 없이도 CI·로컬·테스트가 안전하게 돌도록.
 */
export function getCheckoutProvider(): CheckoutProvider {
  if (env.PAYMENT_PROVIDER === "kakaopay" && env.KAKAO_PAY_SECRET_KEY) {
    return new KakaoPayCheckoutProvider(
      env.KAKAO_PAY_SECRET_KEY,
      env.KAKAO_PAY_CID,
    );
  }
  return new MockCheckoutProvider();
}

export type {
  CheckoutProvider,
  CheckoutReadyInput,
  CheckoutReadyResult,
  CheckoutApproveInput,
  CheckoutApproveResult,
} from "./checkout-types";
