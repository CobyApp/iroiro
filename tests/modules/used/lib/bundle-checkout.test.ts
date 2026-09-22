import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  approve,
  bundleFindUnique,
  bundleUpdateMany,
  tradeUpdateMany,
  tradeFindMany,
  pointCreate,
  listingUpdateMany,
} = vi.hoisted(() => ({
  approve: vi.fn(),
  bundleFindUnique: vi.fn(),
  bundleUpdateMany: vi.fn(),
  tradeUpdateMany: vi.fn(),
  tradeFindMany: vi.fn(),
  pointCreate: vi.fn(),
  listingUpdateMany: vi.fn(),
}));

vi.mock("@/lib/payments/checkout", () => ({
  getCheckoutProvider: () => ({ provider: "kakaopay", kind: "redirect", approve }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usedBundle: { findUnique: bundleFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        usedBundle: { updateMany: bundleUpdateMany },
        usedTrade: { updateMany: tradeUpdateMany, findMany: tradeFindMany },
        pointTransaction: { create: pointCreate },
        usedListing: { updateMany: listingUpdateMany },
      }),
  },
}));

import {
  approveUsedBundlePayment,
  failUsedBundlePayment,
} from "@/modules/used/lib/bundle-checkout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("approveUsedBundlePayment", () => {
  it("pending 묶음을 승인하면 묶음·소속 거래를 paid 로 전이하고 포인트를 차감한다", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "pending",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 500,
    });
    approve.mockResolvedValue({ ok: true, approvedAmount: 30000 });
    bundleUpdateMany.mockResolvedValue({ count: 1 });

    const result = await approveUsedBundlePayment(1, "pg_token", "buyer");

    expect(result).toEqual({ ok: true, bundleId: 1 });
    expect(bundleUpdateMany.mock.calls[0][0].data.status).toBe("paid");
    expect(tradeUpdateMany.mock.calls[0][0].data.status).toBe("paid");
    expect(pointCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: -500 }) }),
    );
  });

  it("이미 paid 면 멱등하게 성공 반환(PG 재호출 없음)", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "paid",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 0,
    });
    const result = await approveUsedBundlePayment(1, "pg_token", "buyer");
    expect(result).toEqual({ ok: true, bundleId: 1 });
    expect(approve).not.toHaveBeenCalled();
  });

  it("구매자가 아니면 승인하지 않는다", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "pending",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 0,
    });
    const result = await approveUsedBundlePayment(1, "pg_token", "attacker");
    expect(result.ok).toBe(false);
    expect(approve).not.toHaveBeenCalled();
    expect(bundleUpdateMany).not.toHaveBeenCalled();
  });

  it("PG 승인이 실패하면 전이하지 않는다", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "pending",
      paymentTid: "T1",
      buyerAccountId: "buyer",
      pointsUsed: 0,
    });
    approve.mockResolvedValue({ ok: false, failMessage: "expired" });
    const result = await approveUsedBundlePayment(1, "bad", "buyer");
    expect(result.ok).toBe(false);
    expect(bundleUpdateMany).not.toHaveBeenCalled();
  });
});

describe("failUsedBundlePayment", () => {
  it("pending 묶음을 취소하고 소속 매물을 다시 판매중으로 되돌린다", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "pending",
      buyerAccountId: "buyer",
    });
    bundleUpdateMany.mockResolvedValue({ count: 1 });
    tradeFindMany.mockResolvedValue([{ listingId: 10n }, { listingId: 11n }]);

    const result = await failUsedBundlePayment(1, "buyer");

    expect(result).toEqual({ bundleId: 1 });
    expect(bundleUpdateMany.mock.calls[0][0].data.status).toBe("canceled");
    expect(tradeUpdateMany.mock.calls[0][0].data.status).toBe("canceled");
    expect(listingUpdateMany.mock.calls[0][0].data.status).toBe("active");
  });

  it("구매자가 아니면 취소하지 않는다(그리핑 차단)", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "pending",
      buyerAccountId: "buyer",
    });
    const result = await failUsedBundlePayment(1, "attacker");
    expect(result).toEqual({ bundleId: 1 });
    expect(bundleUpdateMany).not.toHaveBeenCalled();
  });

  it("pending 이 아니면 아무 것도 바꾸지 않는다", async () => {
    bundleFindUnique.mockResolvedValue({
      id: 1n,
      status: "paid",
      buyerAccountId: "buyer",
    });
    const result = await failUsedBundlePayment(1, "buyer");
    expect(result).toEqual({ bundleId: 1 });
    expect(bundleUpdateMany).not.toHaveBeenCalled();
  });
});
