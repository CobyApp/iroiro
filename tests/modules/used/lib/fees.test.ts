import { describe, expect, it } from "vitest";
import { calcUsedBundleFees, calcUsedTradeFees } from "@/modules/used/lib/fees";

describe("calcUsedTradeFees", () => {
  it("수수료는 상품가에만 부과하고 배송비는 판매자 몫 그대로", () => {
    const fees = calcUsedTradeFees({
      price: 10000,
      shippingFee: 1800,
      feeBp: 1000,
    });
    expect(fees.feeAmount).toBe(1000);
    expect(fees.sellerPayout).toBe(10800);
    expect(fees.buyerTotal).toBe(11800);
  });

  it("반올림 — 10.5% of 9990 = 1049", () => {
    const fees = calcUsedTradeFees({ price: 9990, shippingFee: 0, feeBp: 1050 });
    expect(fees.feeAmount).toBe(1049);
  });

  it("feeBp를 0~5000으로 클램프한다", () => {
    expect(calcUsedTradeFees({ price: 1000, shippingFee: 0, feeBp: 9999 }).feeBp).toBe(5000);
    expect(calcUsedTradeFees({ price: 1000, shippingFee: 0, feeBp: -5 }).feeBp).toBe(0);
  });

  it("수수료 0이면 판매자 정산 = 상품가+배송비", () => {
    const fees = calcUsedTradeFees({ price: 5000, shippingFee: 500, feeBp: 0 });
    expect(fees.feeAmount).toBe(0);
    expect(fees.sellerPayout).toBe(5500);
  });
});

describe("calcUsedBundleFees", () => {
  it("배송비는 가장 큰 것 1회만 부과하고 절감액을 계산한다", () => {
    const b = calcUsedBundleFees({
      items: [
        { price: 10000, shippingFee: 500 },
        { price: 6000, shippingFee: 800 },
        { price: 4000, shippingFee: 300 },
      ],
      feeBp: 1000,
    });
    expect(b.itemTotal).toBe(20000);
    expect(b.shippingFee).toBe(800); // max
    expect(b.shippingSaved).toBe(800); // (500+800+300) - 800
    expect(b.buyerTotal).toBe(20800);
    // 수수료 = 각 상품가 10% 합 = 1000+600+400
    expect(b.feeAmount).toBe(2000);
    expect(b.sellerPayout).toBe(20000 + 800 - 2000);
  });

  it("빈 목록은 0", () => {
    const b = calcUsedBundleFees({ items: [], feeBp: 1000 });
    expect(b.itemTotal).toBe(0);
    expect(b.shippingFee).toBe(0);
    expect(b.shippingSaved).toBe(0);
  });
});
