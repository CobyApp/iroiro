// 상품 원가·마진 계산 — 순수 함수(node 테스트 가능).
// 매입은 엔(JPY) → 매입일 환율로 원(KRW) 환산, 부대비용은 KRW로 합산.

export type CostBreakdown = {
  purchasePriceKrw: number;
  packagingCostKrw: number;
  overseasShippingKrw: number;
  domesticShippingKrw: number;
  otherCostKrw: number;
};

// 매입일 환율로 JPY → KRW (반올림).
export function jpyToKrw(jpy: number, exchangeRate: number): number {
  return Math.round(jpy * exchangeRate);
}

// 총원가(KRW) = 매입가 + 포장 + 해외배송 + 국내배송 + 기타.
export function totalCostKrw(cost: CostBreakdown): number {
  return (
    cost.purchasePriceKrw +
    cost.packagingCostKrw +
    cost.overseasShippingKrw +
    cost.domesticShippingKrw +
    cost.otherCostKrw
  );
}

export type Margin = {
  totalCost: number;
  profit: number;
  marginRate: number; // 판매가 대비 이익률(%), 소수 1자리
};

export function computeMargin(
  salePriceKrw: number,
  cost: CostBreakdown,
): Margin {
  const totalCost = totalCostKrw(cost);
  const profit = salePriceKrw - totalCost;
  const marginRate =
    salePriceKrw > 0 ? Math.round((profit / salePriceKrw) * 1000) / 10 : 0;
  return { totalCost, profit, marginRate };
}
