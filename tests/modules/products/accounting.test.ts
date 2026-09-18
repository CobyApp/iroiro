import { describe, expect, it } from "vitest";
import {
  computeMargin,
  jpyToKrw,
  totalCostKrw,
} from "@/modules/products/lib/accounting";

const cost = {
  purchasePriceKrw: 7000, // 엔 매입 환산분
  packagingCostKrw: 300,
  overseasShippingKrw: 1000,
  domesticShippingKrw: 500,
  otherCostKrw: 200,
};

describe("jpyToKrw", () => {
  it("매입일 환율로 환산·반올림", () => {
    expect(jpyToKrw(1000, 9.35)).toBe(9350);
    expect(jpyToKrw(770, 9.1)).toBe(7007);
  });
});

describe("totalCostKrw", () => {
  it("모든 원가 항목 합산", () => {
    expect(totalCostKrw(cost)).toBe(9000);
  });
});

describe("computeMargin", () => {
  it("판매가 - 총원가 = 이익, 이익률(%)", () => {
    const m = computeMargin(12000, cost);
    expect(m.totalCost).toBe(9000);
    expect(m.profit).toBe(3000);
    expect(m.marginRate).toBe(25); // 3000/12000
  });
  it("판매가 0이면 이익률 0", () => {
    expect(computeMargin(0, cost).marginRate).toBe(0);
  });
  it("원가가 판매가보다 크면 음수 이익", () => {
    expect(computeMargin(5000, cost).profit).toBe(-4000);
  });
});
