import { describe, expect, it } from "vitest";
import {
  settlementTotals,
  summarizeByPurchaser,
  type SettlementInput,
} from "@/modules/products/lib/settlement";

function row(over: Partial<SettlementInput>): SettlementInput {
  return {
    purchaser: null,
    purchasePriceKrw: 0,
    packagingCostKrw: 0,
    overseasShippingKrw: 0,
    domesticShippingKrw: 0,
    otherCostKrw: 0,
    salePrice: 0,
    stockQuantity: 0,
    ...over,
  };
}

describe("summarizeByPurchaser", () => {
  it("매입자별로 원가·판매가·이익을 합산한다", () => {
    const result = summarizeByPurchaser([
      row({ purchaser: "코비", purchasePriceKrw: 10000, salePrice: 15000, stockQuantity: 2 }),
      row({ purchaser: "코비", purchasePriceKrw: 5000, packagingCostKrw: 1000, salePrice: 9000, stockQuantity: 1 }),
      row({ purchaser: "미나미", purchasePriceKrw: 20000, salePrice: 25000, stockQuantity: 1 }),
    ]);

    const coby = result.find((r) => r.purchaser === "코비");
    expect(coby).toMatchObject({
      productCount: 2,
      totalStock: 3,
      totalCost: 16000, // 10000 + (5000+1000)
      totalSalePrice: 24000, // 15000 + 9000
      profit: 8000,
    });

    const minami = result.find((r) => r.purchaser === "미나미");
    expect(minami).toMatchObject({
      productCount: 1,
      totalCost: 20000,
      totalSalePrice: 25000,
      profit: 5000,
      marginRate: 20, // 5000/25000 = 20%
    });
  });

  it("매입자 미지정(null)은 하나의 그룹으로 묶여 맨 뒤로 정렬된다", () => {
    const result = summarizeByPurchaser([
      row({ purchaser: null, purchasePriceKrw: 3000, salePrice: 4000 }),
      row({ purchaser: "코비", purchasePriceKrw: 1000, salePrice: 2000 }),
      row({ purchaser: null, purchasePriceKrw: 2000, salePrice: 3000 }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[result.length - 1].purchaser).toBeNull();
    const unassigned = result.find((r) => r.purchaser === null);
    expect(unassigned?.productCount).toBe(2);
    expect(unassigned?.totalCost).toBe(5000);
  });

  it("총원가가 큰 매입자부터 정렬한다", () => {
    const result = summarizeByPurchaser([
      row({ purchaser: "적음", purchasePriceKrw: 1000, salePrice: 2000 }),
      row({ purchaser: "많음", purchasePriceKrw: 90000, salePrice: 100000 }),
    ]);
    expect(result[0].purchaser).toBe("많음");
    expect(result[1].purchaser).toBe("적음");
  });

  it("판매가 0이면 마진율 0", () => {
    const result = summarizeByPurchaser([
      row({ purchaser: "x", purchasePriceKrw: 1000, salePrice: 0 }),
    ]);
    expect(result[0].marginRate).toBe(0);
    expect(result[0].profit).toBe(-1000);
  });
});

describe("settlementTotals", () => {
  it("모든 매입자 합계를 계산한다", () => {
    const rows = summarizeByPurchaser([
      row({ purchaser: "코비", purchasePriceKrw: 10000, salePrice: 15000, stockQuantity: 2 }),
      row({ purchaser: "미나미", purchasePriceKrw: 20000, salePrice: 25000, stockQuantity: 1 }),
    ]);
    const totals = settlementTotals(rows);
    expect(totals.productCount).toBe(2);
    expect(totals.totalStock).toBe(3);
    expect(totals.totalCost).toBe(30000);
    expect(totals.totalSalePrice).toBe(40000);
    expect(totals.profit).toBe(10000);
    expect(totals.marginRate).toBe(25); // 10000/40000
  });
});
