import { describe, expect, it } from "vitest";
import {
  MOCK_FAIL_TRADE_NO,
  MockPaymentGateway,
} from "@/lib/payments/mock";

describe("MockPaymentGateway", () => {
  const gateway = new MockPaymentGateway();

  it("provider는 'mock'이다", () => {
    expect(gateway.provider).toBe("mock");
  });

  describe("confirm", () => {
    it("승인 시 요청 금액을 그대로 에코하고 trade_no를 발급한다", async () => {
      const result = await gateway.confirm({
        orderNo: "20260704-8K3F9Q2M1D",
        amount: 15000,
        tradeNo: null,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.approvedAmount).toBe(15000);
        expect(result.method).toBe("card");
        expect(result.tradeNo).toMatch(/^mock_/);
        expect(result.approvedAt).toMatch(/^\d{4}-/);
        expect(result.rawRequest).toBeTruthy();
        expect(result.rawResponse).toBeTruthy();
      }
    });

    it("전달된 tradeNo가 있으면 그대로 사용한다(자체 발급 안 함)", async () => {
      const result = await gateway.confirm({
        orderNo: "x",
        amount: 1000,
        tradeNo: "given_key_123",
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.tradeNo).toBe("given_key_123");
    });

    it("mock_fail 마법값이면 거절하고 실패 메시지·raw를 담는다", async () => {
      const result = await gateway.confirm({
        orderNo: "x",
        amount: 1000,
        tradeNo: MOCK_FAIL_TRADE_NO,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failMessage).toBeTruthy();
        expect(result.rawRequest).toBeTruthy();
        expect(result.rawResponse).toBeTruthy();
      }
    });

    it("연속 승인의 자체 발급 trade_no는 서로 다르다", async () => {
      const a = await gateway.confirm({ orderNo: "a", amount: 1, tradeNo: null });
      const b = await gateway.confirm({ orderNo: "b", amount: 1, tradeNo: null });
      if (a.ok && b.ok) expect(a.tradeNo).not.toBe(b.tradeNo);
    });
  });

  describe("cancel", () => {
    it("취소는 성공하고 취소 시각을 담는다", async () => {
      const result = await gateway.cancel({
        tradeNo: "mock_123",
        reason: "고객 요청",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.canceledAt).toMatch(/^\d{4}-/);
        expect(result.rawResponse).toBeTruthy();
      }
    });
  });
});
