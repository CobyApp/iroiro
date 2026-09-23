import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 팩토리는 파일 상단으로 hoist 되므로, 참조 변수도 vi.hoisted 로 함께 끌어올린다.
const {
  notify,
  orderFindManyTop,
  orderUpdateMany,
  orderFindUniqueOrThrow,
  historyCreate,
} = vi.hoisted(() => ({
  notify: vi.fn(),
  orderFindManyTop: vi.fn(),
  orderUpdateMany: vi.fn(),
  orderFindUniqueOrThrow: vi.fn(),
  historyCreate: vi.fn(),
}));

vi.mock("@/modules/notifications/lib/notify", () => ({ notify }));

vi.mock("@/lib/db", () => ({
  db: {
    order: { findMany: orderFindManyTop },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: {
          updateMany: orderUpdateMany,
          findUniqueOrThrow: orderFindUniqueOrThrow,
        },
        orderStatusHistory: { create: historyCreate },
      }),
  },
}));

import {
  autoConfirmDueOrders,
  autoConfirmOrderIfDue,
  ORDER_AUTO_CONFIRM_MS,
} from "@/modules/orders/lib/settle-order";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autoConfirmOrderIfDue", () => {
  it("기한 지난 발송 주문을 배송완료로 전이하고 구매자에게 알림", async () => {
    orderUpdateMany.mockResolvedValue({ count: 1 });
    orderFindUniqueOrThrow.mockResolvedValue({
      id: 1n,
      orderNo: "ORD-1",
      accountId: "buyer",
    });

    const result = await autoConfirmOrderIfDue(1);

    expect(result).toBe(true);
    // shipped + shippedAt <= cutoff 가드로만 전이.
    const where = orderUpdateMany.mock.calls[0][0].where;
    expect(where.status).toBe("shipped");
    expect(where.shippedAt.lte).toBeInstanceOf(Date);
    expect(orderUpdateMany.mock.calls[0][0].data.status).toBe("delivered");
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "delivered" }),
      }),
    );
    expect(notify).toHaveBeenCalledTimes(1); // 구매자
  });

  it("기한 전(전이 없음)이면 false, 이력·알림 없음", async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });

    const result = await autoConfirmOrderIfDue(1);

    expect(result).toBe(false);
    expect(historyCreate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("커트오프는 now − ORDER_AUTO_CONFIRM_MS 다", async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });
    const now = new Date("2026-09-23T00:00:00Z");
    await autoConfirmOrderIfDue(1, now);
    const lte = orderUpdateMany.mock.calls[0][0].where.shippedAt.lte as Date;
    expect(lte.getTime()).toBe(now.getTime() - ORDER_AUTO_CONFIRM_MS);
  });
});

describe("autoConfirmDueOrders (스윕)", () => {
  it("기한 지난 발송 주문 건수를 합산해 반환한다", async () => {
    orderFindManyTop.mockResolvedValue([{ id: 1n }, { id: 2n }]);
    orderUpdateMany.mockResolvedValue({ count: 1 });
    orderFindUniqueOrThrow
      .mockResolvedValueOnce({ id: 1n, orderNo: "ORD-1", accountId: "b" })
      .mockResolvedValueOnce({ id: 2n, orderNo: "ORD-2", accountId: "b" });

    const confirmed = await autoConfirmDueOrders();

    expect(confirmed).toBe(2);
    expect(orderFindManyTop.mock.calls[0][0].where.status).toBe("shipped");
  });
});
