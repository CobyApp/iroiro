import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

const queryRaw = vi.fn();
const cartFindMany = vi.fn();
const cartDeleteMany = vi.fn();
const productFindMany = vi.fn();
const photoFindMany = vi.fn();
const policyFindUnique = vi.fn();
const orderCreate = vi.fn();
const itemCreateMany = vi.fn();
const addressCreate = vi.fn();
const paymentCreate = vi.fn();
const historyCreate = vi.fn();
const txQueryRaw = vi.fn();
const pointAggregate = vi.fn();
const pointCreate = vi.fn();
const couponFindFirst = vi.fn();
const couponUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: queryRaw,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        cartItem: { findMany: cartFindMany, deleteMany: cartDeleteMany },
        product: { findMany: productFindMany },
        productPhoto: { findMany: photoFindMany },
        deliveryPolicy: { findUnique: policyFindUnique },
        order: { create: orderCreate },
        orderItem: { createMany: itemCreateMany },
        orderAddress: { create: addressCreate },
        payment: { create: paymentCreate },
        orderStatusHistory: { create: historyCreate },
        pointTransaction: { aggregate: pointAggregate, create: pointCreate },
        accountCoupon: {
          findFirst: couponFindFirst,
          updateMany: couponUpdateMany,
        },
        $queryRaw: txQueryRaw,
      }),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";

const VALID_ADDRESS = {
  recipientName: "홍길동",
  recipientPhone: "010-1234-5678",
  zipcode: "06236",
  baseAddress: "서울시 강남구 테헤란로",
  detailAddress: "101동 202호",
  deliveryMessage: "부재 시 문 앞",
};

// 상품 salePrice 10000 × 2 = 20000, 배송비 3000 → 23000
const EXPECTED_TOTAL = 23000;

function productRow(data: Record<string, unknown> = {}) {
  return {
    id: 1n,
    name: "테스트 상품",
    itemType: "photocard",
    condition: "good",
    salePrice: 10000,
    stockQuantity: 5,
    saleStatus: "active",
    ...data,
  };
}

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount.mockReset().mockResolvedValue({ id: ACCOUNT_ID });
  queryRaw.mockReset().mockResolvedValue([{ seq: 1n }]);
  cartFindMany
    .mockReset()
    .mockResolvedValue([{ id: 1n, productId: 1n, quantity: 2 }]);
  cartDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  productFindMany.mockReset().mockResolvedValue([productRow()]);
  photoFindMany
    .mockReset()
    .mockResolvedValue([
      { productId: 1n, r2Key: "products/original/thumb.jpg" },
    ]);
  policyFindUnique
    .mockReset()
    .mockResolvedValue({ id: 1n, deliveryFee: 3000, freeThresholdAmount: null });
  orderCreate.mockReset().mockImplementation(async ({ data }) => ({
    id: 5n,
    ...data,
  }));
  itemCreateMany.mockReset().mockResolvedValue({ count: 1 });
  addressCreate.mockReset().mockResolvedValue({});
  paymentCreate.mockReset().mockResolvedValue({});
  historyCreate.mockReset().mockResolvedValue({});
  txQueryRaw.mockReset().mockResolvedValue([{ id: ACCOUNT_ID }]);
  pointAggregate.mockReset().mockResolvedValue({ _sum: { amount: 6000 } });
  pointCreate.mockReset().mockResolvedValue({});
  couponFindFirst.mockReset().mockResolvedValue({ id: 7n });
  couponUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("placeOrder", () => {
  it("주문·아이템·주소·결제(ready)·이력을 생성하고 장바구니를 비운다(happy)", async () => {
    const { placeOrder } = await import("@/modules/orders/actions");

    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: EXPECTED_TOTAL,
    });

    if (!result.ok) throw new Error(result.message);
    expect(result.data.orderNo).toMatch(/^OSK[0-9A-Z]{9}$/);
    const orderData = orderCreate.mock.calls[0][0].data;
    expect(orderData).toMatchObject({
      accountId: ACCOUNT_ID,
      status: "pending",
      productAmount: 20000,
      deliveryAmount: 3000,
      totalAmount: 23000,
    });
    // 아이템 스냅샷
    const items = itemCreateMany.mock.calls[0][0].data;
    expect(items[0]).toMatchObject({
      productName: "테스트 상품",
      productThumbnailKey: "products/original/thumb.jpg",
      unitPrice: 10000,
      quantity: 2,
      condition: "good",
    });
    // 주소·결제·이력
    expect(addressCreate.mock.calls[0][0].data).toMatchObject({
      recipientName: "홍길동",
      zipcode: "06236",
    });
    expect(paymentCreate.mock.calls[0][0].data).toMatchObject({
      status: "ready",
      provider: "mock",
      requestedAmount: 23000,
    });
    expect(historyCreate.mock.calls[0][0].data).toMatchObject({
      status: "pending",
    });
    // 장바구니 비움 — 재고 차감은 없다(승인 직전 선점)
    expect(cartDeleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it("로그인하지 않으면 거부한다(auth)", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: EXPECTED_TOTAL,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/로그인/) });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("수령인이 비면 schema 검증 실패(zod)", async () => {
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      recipientName: "",
      expectedTotalAmount: EXPECTED_TOTAL,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("기대 금액이 서버 계산과 다르면 거부한다(금액 변조 방지)", async () => {
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({ ...VALID_ADDRESS, expectedTotalAmount: 100 });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/가격/) });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("장바구니가 비어 있으면 거부한다", async () => {
    cartFindMany.mockResolvedValue([]);
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: EXPECTED_TOTAL,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/장바구니/) });
  });

  it("판매 종료 상품이 포함되면 거부한다", async () => {
    productFindMany.mockResolvedValue([productRow({ saleStatus: "archived" })]);
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: EXPECTED_TOTAL,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/판매/) });
  });

  it("재고가 부족한 상품이 포함되면 거부한다", async () => {
    productFindMany.mockResolvedValue([productRow({ stockQuantity: 1 })]);
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: EXPECTED_TOTAL,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/재고/) });
  });

  it("포인트 사용 — 할인 반영·원장 차감 기록·계정 행 잠금", async () => {
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: 23000 - 5000,
      usePoints: 5000,
    });
    if (!result.ok) throw new Error(result.message);
    expect(orderCreate.mock.calls[0][0].data).toMatchObject({
      discountAmount: 5000,
      totalAmount: 18000,
    });
    expect(pointCreate.mock.calls[0][0].data).toMatchObject({
      accountId: ACCOUNT_ID,
      amount: -5000,
      reason: "order_use",
      orderId: 5n,
    });
    // FOR UPDATE 계정 행 잠금 — 동시 주문 간 이중 사용 직렬화의 핵심.
    expect(txQueryRaw).toHaveBeenCalled();
  });

  it("보유 포인트를 초과하면 거부한다", async () => {
    pointAggregate.mockResolvedValue({ _sum: { amount: 100 } });
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: 23000 - 5000,
      usePoints: 5000,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/포인트/) });
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it("상품 금액을 초과하는 포인트는 거부한다", async () => {
    pointAggregate.mockResolvedValue({ _sum: { amount: 999999 } });
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: 3000,
      usePoints: 25000, // productAmount 20000 초과
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/상품 금액/) });
  });

  it("무료배송 쿠폰 — 배송비 0·쿠폰 소진 기록", async () => {
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: 20000,
      useFreeShippingCoupon: true,
    });
    if (!result.ok) throw new Error(result.message);
    expect(orderCreate.mock.calls[0][0].data).toMatchObject({
      deliveryAmount: 0,
      totalAmount: 20000,
    });
    expect(couponUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 7n, usedAt: null },
    });
    expect(couponUpdateMany.mock.calls[0][0].data).toMatchObject({
      usedOrderId: 5n,
    });
  });

  it("사용 가능한 쿠폰이 없으면 거부한다", async () => {
    couponFindFirst.mockResolvedValue(null);
    const { placeOrder } = await import("@/modules/orders/actions");
    const result = await placeOrder({
      ...VALID_ADDRESS,
      expectedTotalAmount: 20000,
      useFreeShippingCoupon: true,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/쿠폰/) });
    expect(orderCreate).not.toHaveBeenCalled();
  });
});
