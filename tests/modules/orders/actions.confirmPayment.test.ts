import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

// 컬렉션 적재는 자체 테스트가 있는 교차 도메인 경계 — 호출 여부만 검증.
const { mockMaterializeItems } = vi.hoisted(() => ({
  mockMaterializeItems: vi.fn(),
}));
vi.mock("@/modules/collection/lib/materialize", () => ({
  materializeItems: mockMaterializeItems,
}));

const orderFindFirst = vi.fn();
const paymentFindUnique = vi.fn();
const itemFindMany = vi.fn();
const productFindMany = vi.fn();
const paymentUpdateMany = vi.fn();
const paymentUpdate = vi.fn();
const orderUpdate = vi.fn();
const historyCreate = vi.fn();
const executeRaw = vi.fn();
// 취소 경로의 포인트 환급·쿠폰 복원 — 기본값: 사용 내역 없음(no-op).
const pointTxFindFirst = vi.fn().mockResolvedValue(null);
const pointTxCreate = vi.fn();
const couponUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    order: { findFirst: orderFindFirst },
    payment: { findUnique: paymentFindUnique },
    orderItem: { findMany: itemFindMany },
    product: { findMany: productFindMany },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        payment: { updateMany: paymentUpdateMany, update: paymentUpdate },
        order: { update: orderUpdate },
        orderStatusHistory: { create: historyCreate },
        pointTransaction: { findFirst: pointTxFindFirst, create: pointTxCreate },
        accountCoupon: { updateMany: couponUpdateMany },
        $executeRaw: executeRaw,
      }),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const ORDER_NO = "20260704-TESTORDER1";
const TOTAL = 23000;

function orderRow(data: Record<string, unknown> = {}) {
  return {
    id: 1n,
    orderNo: ORDER_NO,
    accountId: ACCOUNT_ID,
    status: "pending",
    productAmount: 20000,
    discountAmount: 0,
    deliveryAmount: 3000,
    totalAmount: TOTAL,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

function paymentRow(data: Record<string, unknown> = {}) {
  return {
    id: 1n,
    orderId: 1n,
    accountId: ACCOUNT_ID,
    orderNo: ORDER_NO,
    provider: "mock",
    method: null,
    status: "ready",
    requestedAmount: TOTAL,
    approvedAmount: null,
    tradeNo: null,
    approvedAt: null,
    canceledAt: null,
    failMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount.mockReset().mockResolvedValue({ id: ACCOUNT_ID });
  mockMaterializeItems.mockReset().mockResolvedValue(undefined);
  orderFindFirst.mockReset().mockResolvedValue(orderRow());
  paymentFindUnique.mockReset().mockResolvedValue(paymentRow());
  // 1차: 재고 선점용 stock line, 2차: 승인 반영용 스냅샷(승인 성공 시에만)
  itemFindMany.mockReset().mockImplementation(async ({ select }) =>
    select?.productName
      ? [
          {
            id: 1n,
            productId: 1n,
            quantity: 2,
            productName: "상품",
            productThumbnailKey: null,
            itemType: "photocard",
          },
        ]
      : [{ productId: 1n, quantity: 2 }],
  );
  productFindMany
    .mockReset()
    .mockResolvedValue([{ id: 1n, teamId: null, memberId: null }]);
  paymentUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  paymentUpdate.mockReset().mockResolvedValue({});
  orderUpdate.mockReset().mockResolvedValue({});
  historyCreate.mockReset().mockResolvedValue({});
  executeRaw.mockReset().mockResolvedValue(1); // 재고 차감·복원 성공
});

describe("confirmPayment", () => {
  it("승인 시 주문 paid·결제 approved로 전이하고 컬렉션을 적재한다(happy)", async () => {
    const { confirmPayment } = await import("@/modules/orders/actions");

    const result = await confirmPayment({ orderNo: ORDER_NO });

    if (!result.ok) throw new Error(result.message);
    expect(result.data.orderNo).toBe(ORDER_NO);
    // 선점 락: ready → in_progress 조건부 전이
    expect(paymentUpdateMany.mock.calls[0][0].where.status).toBe("ready");
    // 승인 반영
    const approvedPatch = paymentUpdate.mock.calls[0][0].data;
    expect(approvedPatch.status).toBe("approved");
    expect(approvedPatch.method).toBe("card");
    expect(approvedPatch.tradeNo).toMatch(/^mock_/);
    expect(approvedPatch.approvedAmount).toBe(TOTAL);
    expect(orderUpdate.mock.calls[0][0].data.status).toBe("paid");
    expect(historyCreate.mock.calls[0][0].data.status).toBe("paid");
    expect(mockMaterializeItems).toHaveBeenCalledTimes(1);
  });

  it("이미 승인된 주문은 멱등하게 성공을 반환한다", async () => {
    orderFindFirst.mockResolvedValue(orderRow({ status: "paid" }));
    paymentFindUnique.mockResolvedValue(paymentRow({ status: "approved" }));
    const { confirmPayment } = await import("@/modules/orders/actions");

    const result = await confirmPayment({ orderNo: ORDER_NO });

    if (!result.ok) throw new Error(result.message);
    expect(result.data.orderNo).toBe(ORDER_NO);
    expect(paymentUpdateMany).not.toHaveBeenCalled();
    expect(historyCreate).not.toHaveBeenCalled();
  });

  it("mock_fail 마법값이면 결제 실패·주문 취소·재고 복원 후 ok:false를 반환한다", async () => {
    const { confirmPayment } = await import("@/modules/orders/actions");

    const result = await confirmPayment({ orderNo: ORDER_NO, tradeNo: "mock_fail" });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/거절/) });

    expect(paymentUpdate.mock.calls[0][0].data.status).toBe("failed");
    expect(paymentUpdate.mock.calls[0][0].data.failMessage).toBeTruthy();
    expect(orderUpdate.mock.calls[0][0].data.status).toBe("canceled");
    // 재고 차감(1회) + 복원(1회)
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(mockMaterializeItems).not.toHaveBeenCalled();
  });

  it("이미 진행 중(선점 락 실패)이면 중복 결제를 거부한다", async () => {
    paymentUpdateMany.mockResolvedValue({ count: 0 });
    const { confirmPayment } = await import("@/modules/orders/actions");

    const result = await confirmPayment({ orderNo: ORDER_NO });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/진행 중/) });
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it("로그인하지 않으면 거부한다(auth)", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { confirmPayment } = await import("@/modules/orders/actions");
    const result = await confirmPayment({ orderNo: ORDER_NO });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/로그인/) });
  });

  it("존재하지 않는 주문은 거부한다", async () => {
    orderFindFirst.mockResolvedValue(null);
    const { confirmPayment } = await import("@/modules/orders/actions");
    const result = await confirmPayment({ orderNo: "20260704-NOSUCHORD" });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/찾을 수 없/) });
  });
});

describe("cancelOrder", () => {
  it("pending 주문을 취소한다(주문·결제 canceled)", async () => {
    const { cancelOrder } = await import("@/modules/orders/actions");

    await cancelOrder({ orderNo: ORDER_NO });

    expect(orderUpdate.mock.calls[0][0].data.status).toBe("canceled");
    const paymentPatch = paymentUpdateMany.mock.calls[0][0].data;
    expect(paymentPatch.status).toBe("canceled");
    expect(paymentPatch.canceledAt).toBeInstanceOf(Date);
    expect(historyCreate.mock.calls[0][0].data.status).toBe("canceled");
  });

  it("pending이 아니면 취소할 수 없다", async () => {
    orderFindFirst.mockResolvedValue(orderRow({ status: "paid" }));
    const { cancelOrder } = await import("@/modules/orders/actions");

    const result = await cancelOrder({ orderNo: ORDER_NO });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/취소할 수 없/) });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("로그인하지 않으면 거부한다(auth)", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { cancelOrder } = await import("@/modules/orders/actions");
    const result = await cancelOrder({ orderNo: ORDER_NO });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/로그인/) });
  });
});
