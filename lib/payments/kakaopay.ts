import "server-only";

import type {
  CheckoutApproveInput,
  CheckoutApproveResult,
  CheckoutProvider,
  CheckoutReadyInput,
  CheckoutReadyResult,
} from "./checkout-types";

// 카카오페이 단건결제 오픈 API(2023+ open-api.kakaopay.com). SECRET_KEY 인증.
const READY_URL = "https://open-api.kakaopay.com/online/v1/payment/ready";
const APPROVE_URL = "https://open-api.kakaopay.com/online/v1/payment/approve";

type KakaoReadyResponse = {
  tid: string;
  next_redirect_pc_url: string;
  next_redirect_mobile_url?: string;
  next_redirect_app_url?: string;
  created_at?: string;
};

type KakaoApproveResponse = {
  aid: string;
  tid: string;
  amount?: { total?: number };
  approved_at?: string;
};

/**
 * 카카오페이 단건결제 어댑터(kind="redirect").
 * ready → next_redirect_pc_url 로 리다이렉트 → 사용자 승인 후 approval_url 로 pg_token 수신
 * → approve 로 결제 확정. 시크릿 키는 생성자로 주입(env → getCheckoutProvider 에서 해석).
 * 키가 없으면 이 어댑터는 만들지 않고 mock 으로 폴백하므로, 여기서는 항상 키가 있다고 본다.
 */
export class KakaoPayCheckoutProvider implements CheckoutProvider {
  readonly provider = "kakaopay";
  readonly kind = "redirect" as const;

  constructor(
    private readonly secretKey: string,
    private readonly cid: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `SECRET_KEY ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  async ready(input: CheckoutReadyInput): Promise<CheckoutReadyResult> {
    const body = {
      cid: this.cid,
      partner_order_id: input.orderNo,
      partner_user_id: input.userId,
      item_name: input.itemName,
      quantity: input.quantity,
      total_amount: input.totalAmount,
      tax_free_amount: 0,
      approval_url: input.approvalUrl,
      cancel_url: input.cancelUrl,
      fail_url: input.failUrl,
    };
    try {
      const res = await fetch(READY_URL, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const raw = (await res.json().catch(() => null)) as
        | KakaoReadyResponse
        | { msg?: string; error_message?: string }
        | null;
      if (!res.ok || !raw || !("tid" in raw) || !raw.tid) {
        return {
          ok: false,
          failMessage:
            (raw && "msg" in raw && raw.msg) ||
            (raw && "error_message" in raw && raw.error_message) ||
            `카카오페이 결제 준비 실패 (HTTP ${res.status})`,
          raw,
        };
      }
      return {
        ok: true,
        tid: raw.tid,
        redirectUrl: raw.next_redirect_pc_url,
        raw,
      };
    } catch (error) {
      return {
        ok: false,
        failMessage: "카카오페이 결제 준비 중 오류가 발생했어요",
        raw: { error: String(error) },
      };
    }
  }

  async approve(input: CheckoutApproveInput): Promise<CheckoutApproveResult> {
    const body = {
      cid: this.cid,
      tid: input.tid,
      partner_order_id: input.orderNo,
      partner_user_id: input.userId,
      pg_token: input.pgToken,
    };
    try {
      const res = await fetch(APPROVE_URL, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const raw = (await res.json().catch(() => null)) as
        | KakaoApproveResponse
        | { msg?: string; error_message?: string }
        | null;
      if (!res.ok || !raw || !("aid" in raw) || !raw.aid) {
        return {
          ok: false,
          failMessage:
            (raw && "msg" in raw && raw.msg) ||
            (raw && "error_message" in raw && raw.error_message) ||
            `카카오페이 결제 승인 실패 (HTTP ${res.status})`,
          raw,
        };
      }
      return {
        ok: true,
        approvedAmount: raw.amount?.total ?? 0,
        approvedAt: raw.approved_at ?? new Date().toISOString(),
        raw,
      };
    } catch (error) {
      return {
        ok: false,
        failMessage: "카카오페이 결제 승인 중 오류가 발생했어요",
        raw: { error: String(error) },
      };
    }
  }
}
