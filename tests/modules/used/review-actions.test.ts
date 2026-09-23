import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAccount, tradeFindUnique, reviewCreate } = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  tradeFindUnique: vi.fn(),
  reviewCreate: vi.fn(),
}));

vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    usedTrade: { findUnique: tradeFindUnique },
    usedReview: { create: reviewCreate },
  },
}));

import { createUsedReview } from "@/modules/used/review-actions";

const completedTrade = {
  buyerAccountId: "buyer",
  sellerAccountId: "seller",
  listingId: 10n,
  status: "completed",
};

beforeEach(() => {
  vi.clearAllMocks();
  tradeFindUnique.mockResolvedValue(completedTrade);
  reviewCreate.mockResolvedValue({ id: 1n });
});

describe("createUsedReview (양방향)", () => {
  it("구매자가 남기면 대상은 판매자", async () => {
    getCurrentAccount.mockResolvedValue({ id: "buyer" });
    const res = await createUsedReview({ tradeId: 1, rating: 5 });
    expect(res.ok).toBe(true);
    expect(reviewCreate.mock.calls[0][0].data).toMatchObject({
      reviewerAccountId: "buyer",
      revieweeAccountId: "seller",
      rating: 5,
    });
  });

  it("판매자가 남기면 대상은 구매자", async () => {
    getCurrentAccount.mockResolvedValue({ id: "seller" });
    const res = await createUsedReview({ tradeId: 1, rating: 4 });
    expect(res.ok).toBe(true);
    expect(reviewCreate.mock.calls[0][0].data).toMatchObject({
      reviewerAccountId: "seller",
      revieweeAccountId: "buyer",
    });
  });

  it("당사자가 아니면 거부", async () => {
    getCurrentAccount.mockResolvedValue({ id: "stranger" });
    const res = await createUsedReview({ tradeId: 1, rating: 5 });
    expect(res.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("완료 전 거래는 거부", async () => {
    getCurrentAccount.mockResolvedValue({ id: "buyer" });
    tradeFindUnique.mockResolvedValue({ ...completedTrade, status: "shipped" });
    const res = await createUsedReview({ tradeId: 1, rating: 5 });
    expect(res.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("비로그인 거부", async () => {
    getCurrentAccount.mockResolvedValue(null);
    const res = await createUsedReview({ tradeId: 1, rating: 5 });
    expect(res.ok).toBe(false);
  });
});
