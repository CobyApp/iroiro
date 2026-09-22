import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  approve,
  tradeFindUnique,
  tradeUpdateMany,
  pointCreate,
  listingUpdateMany,
} = vi.hoisted(() => ({
  approve: vi.fn(),
  tradeFindUnique: vi.fn(),
  tradeUpdateMany: vi.fn(),
  pointCreate: vi.fn(),
  listingUpdateMany: vi.fn(),
}));

vi.mock("@/lib/payments/checkout", () => ({
  getCheckoutProvider: () => ({ provider: "kakaopay", kind: "redirect", approve }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usedTrade: { findUnique: tradeFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        usedTrade: { updateMany: tradeUpdateMany },
        pointTransaction: { create: pointCreate },
        usedListing: { updateMany: listingUpdateMany },
      }),
  },
}));

import {
  approveUsedTradePayment,
  failUsedTradePayment,
} from "@/modules/used/lib/checkout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("approveUsedTradePayment", () => {
  it("pending 거래를 승인하면 paid 로 전이하고 포인트를 차감한다", async () => {
    tradeFindUnique.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      status: "pending",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 500,
    });
    approve.mockResolvedValue({ ok: true, approvedAmount: 12000 });
    tradeUpdateMany.mockResolvedValue({ count: 1 });

    const result = await approveUsedTradePayment(1, "pg_token", "buyer");

    expect(result).toEqual({ ok: true, listingId: 10 });
    expect(approve).toHaveBeenCalledWith(
      expect.objectContaining({ tid: "T1", pgToken: "pg_token", orderNo: "used-1" }),
    );
    expect(tradeUpdateMany.mock.calls[0][0].data.status).toBe("paid");
    expect(pointCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -500 }) }),
    );
  });

  it("이미 paid 면 멱등하게 성공 반환(PG 재호출 없음)", async () => {
    tradeFindUnique.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      status: "paid",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 0,
    });

    const result = await approveUsedTradePayment(1, "pg_token", "buyer");

    expect(result).toEqual({ ok: true, listingId: 10 });
    expect(approve).not.toHaveBeenCalled();
  });

  it("PG 승인이 실패하면 전이하지 않고 실패 메시지를 돌려준다", async () => {
    tradeFindUnique.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      status: "pending",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 0,
    });
    approve.mockResolvedValue({ ok: false, failMessage: "expired" });

    const result = await approveUsedTradePayment(1, "bad", "buyer");

    expect(result.ok).toBe(false);
    expect(tradeUpdateMany).not.toHaveBeenCalled();
  });

  it("거래가 없으면 실패", async () => {
    tradeFindUnique.mockResolvedValue(null);
    const result = await approveUsedTradePayment(9, "x", "buyer");
    expect(result.ok).toBe(false);
  });
});

describe("failUsedTradePayment", () => {
  it("pending 거래를 취소하고 매물을 다시 판매중으로 되돌린다", async () => {
    tradeFindUnique.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      status: "pending",
      buyerAccountId: "buyer",
    });
    tradeUpdateMany.mockResolvedValue({ count: 1 });

    const result = await failUsedTradePayment(1, "buyer");

    expect(result).toEqual({ listingId: 10 });
    expect(tradeUpdateMany.mock.calls[0][0].data.status).toBe("canceled");
    expect(listingUpdateMany.mock.calls[0][0].data.status).toBe("active");
  });

  it("pending 이 아니면 아무 것도 바꾸지 않는다", async () => {
    tradeFindUnique.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      status: "paid",
      buyerAccountId: "buyer",
    });
    const result = await failUsedTradePayment(1, "buyer");
    expect(result).toEqual({ listingId: 10 });
    expect(tradeUpdateMany).not.toHaveBeenCalled();
  });

  it("구매자가 아니면 취소하지 않는다(그리핑 차단)", async () => {
    tradeFindUnique.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      status: "pending",
      buyerAccountId: "buyer",
    });
    const result = await failUsedTradePayment(1, "attacker");
    expect(result).toEqual({ listingId: 10 });
    expect(tradeUpdateMany).not.toHaveBeenCalled();
  });
});
