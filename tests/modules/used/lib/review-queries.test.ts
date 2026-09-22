import { beforeEach, describe, expect, it, vi } from "vitest";

const { aggregate, findMany } = vi.hoisted(() => ({
  aggregate: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { usedReview: { aggregate, findMany } },
}));

import {
  getSellerReviewSummary,
  listSellerReviews,
  reviewedTradeIdsOf,
} from "@/modules/used/lib/review-queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSellerReviewSummary", () => {
  it("평균 별점을 소수 1자리로 반올림하고 개수를 반환한다", async () => {
    aggregate.mockResolvedValue({ _avg: { rating: 4.333 }, _count: { _all: 3 } });
    expect(await getSellerReviewSummary("s1")).toEqual({ count: 3, avg: 4.3 });
  });

  it("후기가 없으면 avg 0", async () => {
    aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
    expect(await getSellerReviewSummary("s1")).toEqual({ count: 0, avg: 0 });
  });
});

describe("listSellerReviews", () => {
  it("작성자를 #뒤4자리로 마스킹한다", async () => {
    findMany.mockResolvedValue([
      {
        id: 1n,
        tradeId: 10n,
        listingId: 20n,
        reviewerAccountId: "aaaabbbbccccdddd0009",
        rating: 5,
        comment: "좋아요",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
    const rows = await listSellerReviews("s1");
    expect(rows[0]).toMatchObject({ reviewerMasked: "#0009", rating: 5, tradeId: 10 });
  });
});

describe("reviewedTradeIdsOf", () => {
  it("빈 입력이면 조회 없이 빈 집합", async () => {
    const set = await reviewedTradeIdsOf("r1", []);
    expect(set.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("작성한 거래 id 집합을 돌려준다", async () => {
    findMany.mockResolvedValue([{ tradeId: 10n }, { tradeId: 12n }]);
    const set = await reviewedTradeIdsOf("r1", [10, 11, 12]);
    expect([...set].sort()).toEqual([10, 12]);
  });
});
