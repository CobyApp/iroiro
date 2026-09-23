// 중고거래 수수료 계산 — 순수 함수(테스트 대상).
// feeBp는 만분율(1000 = 10%). 수수료는 상품가에만 부과하고 배송비는 판매자 몫 그대로.

export type FeeBreakdown = {
  price: number;
  shippingFee: number;
  feeBp: number;
  feeAmount: number;
  sellerPayout: number;
  buyerTotal: number;
};

export function calcUsedTradeFees(input: {
  price: number;
  shippingFee: number;
  feeBp: number;
}): FeeBreakdown {
  const price = Math.max(0, Math.trunc(input.price));
  const shippingFee = Math.max(0, Math.trunc(input.shippingFee));
  const feeBp = Math.min(5000, Math.max(0, Math.trunc(input.feeBp)));
  const feeAmount = Math.round((price * feeBp) / 10000);
  return {
    price,
    shippingFee,
    feeBp,
    feeAmount,
    sellerPayout: price + shippingFee - feeAmount,
    buyerTotal: price + shippingFee,
  };
}

export type BundleFeeBreakdown = {
  itemTotal: number;
  shippingFee: number;
  feeAmount: number;
  sellerPayout: number;
  buyerTotal: number;
  // 개별 구매 대비 배송비 절감액(= 각 배송비 합 − 묶음 1회 배송비).
  shippingSaved: number;
};

// 묶음 구매 수수료 — 배송비는 한 번(가장 큰 배송비 = 한 소포)만, 수수료는 각 상품가에.
export function calcUsedBundleFees(input: {
  items: { price: number; shippingFee: number }[];
  feeBp: number;
}): BundleFeeBreakdown {
  const feeBp = Math.min(5000, Math.max(0, Math.trunc(input.feeBp)));
  const prices = input.items.map((i) => Math.max(0, Math.trunc(i.price)));
  const shippings = input.items.map((i) => Math.max(0, Math.trunc(i.shippingFee)));
  const itemTotal = prices.reduce((a, b) => a + b, 0);
  // 한 소포로 합쳐 보내므로 가장 큰 배송비만 부과한다.
  const shippingFee = shippings.length ? Math.max(...shippings) : 0;
  const shippingSaved = shippings.reduce((a, b) => a + b, 0) - shippingFee;
  const feeAmount = prices.reduce(
    (sum, p) => sum + Math.round((p * feeBp) / 10000),
    0,
  );
  return {
    itemTotal,
    shippingFee,
    feeAmount,
    sellerPayout: itemTotal + shippingFee - feeAmount,
    buyerTotal: itemTotal + shippingFee,
    shippingSaved,
  };
}
