import { afterEach, describe, expect, it, vi } from "vitest";
import { KakaoPayCheckoutProvider } from "@/lib/payments/kakaopay";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const provider = new KakaoPayCheckoutProvider("test-secret", "TC0ONETIME");
const readyInput = {
  orderNo: "used-1",
  userId: "buyer-1",
  itemName: "포토카드",
  quantity: 1,
  totalAmount: 12000,
  approvalUrl: "https://app.example/api/payment/kakao/approve?trade=1",
  cancelUrl: "https://app.example/api/payment/kakao/cancel?trade=1",
  failUrl: "https://app.example/api/payment/kakao/fail?trade=1",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("KakaoPayCheckoutProvider", () => {
  it("provider·kind 는 kakaopay·redirect 다", () => {
    expect(provider.provider).toBe("kakaopay");
    expect(provider.kind).toBe("redirect");
  });

  describe("ready", () => {
    it("성공 시 tid 와 결제창 URL(next_redirect_pc_url)을 돌려준다", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          tid: "T1234567890",
          next_redirect_pc_url: "https://online-pay.kakao.com/pc/xxx",
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await provider.ready(readyInput);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tid).toBe("T1234567890");
        expect(result.redirectUrl).toBe("https://online-pay.kakao.com/pc/xxx");
      }
      // SECRET_KEY 인증 헤더와 partner_order_id 를 실어 보낸다.
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/payment/ready");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "SECRET_KEY test-secret",
      );
      expect(JSON.parse(init.body).partner_order_id).toBe("used-1");
    });

    it("HTTP 오류면 실패로 처리하고 메시지를 담는다", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ msg: "invalid cid" }, false, 400),
        ),
      );

      const result = await provider.ready(readyInput);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failMessage).toBe("invalid cid");
    });

    it("네트워크 예외도 실패로 감싼다(throw 하지 않음)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down")),
      );

      const result = await provider.ready(readyInput);
      expect(result.ok).toBe(false);
    });
  });

  describe("approve", () => {
    it("성공 시 승인 금액·시각을 돌려준다", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            aid: "A123",
            tid: "T1234567890",
            amount: { total: 12000 },
            approved_at: "2026-09-23T10:00:00",
          }),
        ),
      );

      const result = await provider.approve({
        tid: "T1234567890",
        orderNo: "used-1",
        userId: "buyer-1",
        pgToken: "pg_token_xyz",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.approvedAmount).toBe(12000);
        expect(result.approvedAt).toBe("2026-09-23T10:00:00");
      }
    });

    it("승인 실패(aid 없음)면 실패로 처리한다", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({ error_message: "expired pg_token" }, false, 400),
        ),
      );

      const result = await provider.approve({
        tid: "T1234567890",
        orderNo: "used-1",
        userId: "buyer-1",
        pgToken: "bad",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failMessage).toBe("expired pg_token");
    });
  });
});
