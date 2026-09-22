import { beforeEach, describe, expect, it, vi } from "vitest";

// @/lib/db 목 — report.ts 는 db as defaultDb 를 기본 인자로 쓴다.
const {
  reportCount,
  reportFindMany,
  reportUpdateMany,
  reviewFindMany,
  reviewUpdateMany,
  transaction,
  txQueryRaw,
  txReportCreate,
  txReviewUpdateMany,
  txReportUpdateMany,
} = vi.hoisted(() => ({
  reportCount: vi.fn(),
  reportFindMany: vi.fn(),
  reportUpdateMany: vi.fn(),
  reviewFindMany: vi.fn(),
  reviewUpdateMany: vi.fn(),
  transaction: vi.fn(),
  txQueryRaw: vi.fn(),
  txReportCreate: vi.fn(),
  txReviewUpdateMany: vi.fn(),
  txReportUpdateMany: vi.fn(),
}));

function fakeTx() {
  return {
    $queryRaw: txQueryRaw,
    productReview: { updateMany: txReviewUpdateMany },
    productReviewReport: { create: txReportCreate, updateMany: txReportUpdateMany },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    productReviewReport: {
      count: reportCount,
      findMany: reportFindMany,
      updateMany: reportUpdateMany,
    },
    productReview: { findMany: reviewFindMany, updateMany: reviewUpdateMany },
    $transaction: transaction,
  },
}));

import {
  countUnresolvedProductReviewReports,
  createProductReviewReport,
  dismissProductReviewReport,
  hideProductReview,
  listProductReviewReportQueue,
  unhideProductReview,
} from "@/modules/reviews/lib/report";

const REPORTER = "11111111-1111-1111-1111-111111111111";
const AUTHOR = "99999999-9999-9999-9999-999999999999";

function reviewRow(over: Record<string, unknown> = {}) {
  return {
    account_id: AUTHOR,
    rating: 5,
    body: "좋아요",
    product_id: 42n,
    product_name: "토레카 A",
    reviewer_name: "구매자",
    created_at: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reportCount.mockResolvedValue(0); // rate limit 통과
  transaction.mockImplementation(async (cb: (tx: ReturnType<typeof fakeTx>) => unknown) => cb(fakeTx()));
  txReportCreate.mockResolvedValue({});
});

describe("createProductReviewReport", () => {
  it("대상 리뷰가 없거나 숨김이면 신고할 수 없다", async () => {
    txQueryRaw.mockResolvedValue([]);
    await expect(
      createProductReviewReport(REPORTER, { reviewId: 5, reason: "abuse" }),
    ).rejects.toThrow(/신고할 수 없는 리뷰/);
  });

  it("본인 리뷰는 신고할 수 없다", async () => {
    txQueryRaw.mockResolvedValue([reviewRow({ account_id: REPORTER })]);
    await expect(
      createProductReviewReport(REPORTER, { reviewId: 5, reason: "abuse" }),
    ).rejects.toThrow(/본인 리뷰/);
    expect(txReportCreate).not.toHaveBeenCalled();
  });

  it("정상 신고 — 스냅샷을 동결해 생성한다", async () => {
    txQueryRaw.mockResolvedValue([reviewRow()]);
    await createProductReviewReport(REPORTER, { reviewId: 5, reason: "false", detail: "거짓" });
    expect(txReportCreate).toHaveBeenCalledTimes(1);
    const arg = txReportCreate.mock.calls[0][0];
    expect(arg.data.reason).toBe("false");
    expect(arg.data.detail).toBe("거짓");
    expect(arg.data.reporterAccountId).toBe(REPORTER);
    expect(arg.data.snapshot).toMatchObject({
      version: 1,
      rating: 5,
      body: "좋아요",
      productId: 42,
      productName: "토레카 A",
      reviewerName: "구매자",
    });
  });

  it("중복 신고(P2002 review_id)는 도메인 메시지로 변환한다", async () => {
    txQueryRaw.mockResolvedValue([reviewRow()]);
    txReportCreate.mockRejectedValue({
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["review_id", "reporter_account_id"] },
    });
    await expect(
      createProductReviewReport(REPORTER, { reviewId: 5, reason: "spam" }),
    ).rejects.toThrow(/이미 신고한 리뷰/);
  });

  it("rate limit 초과면 거부한다", async () => {
    reportCount.mockResolvedValue(999);
    await expect(
      createProductReviewReport(REPORTER, { reviewId: 5, reason: "spam" }),
    ).rejects.toThrow(/너무 잦/);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("listProductReviewReportQueue", () => {
  it("대상 리뷰 상태를 큐 표시 상태로 매핑한다", async () => {
    reportCount.mockResolvedValue(3);
    reportFindMany.mockResolvedValue([
      { id: 1n, reviewId: 10n, reason: "abuse", detail: null, snapshot: { version: 1 }, reporterAccountId: "aaaabbbbccccddddeeee0001", createdAt: new Date("2026-09-01T00:00:00Z") },
      { id: 2n, reviewId: 20n, reason: "spam", detail: "x", snapshot: { version: 1 }, reporterAccountId: "aaaabbbbccccddddeeee0002", createdAt: new Date("2026-09-02T00:00:00Z") },
      { id: 3n, reviewId: 30n, reason: "other", detail: null, snapshot: { version: 1 }, reporterAccountId: "aaaabbbbccccddddeeee0003", createdAt: new Date("2026-09-03T00:00:00Z") },
    ]);
    reviewFindMany.mockResolvedValue([
      { id: 10n, hiddenAt: null },
      { id: 20n, hiddenAt: new Date("2026-09-05T00:00:00Z") },
      // 30 없음 → missing
    ]);
    const page = await listProductReviewReportQueue(1);
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.targetStatus)).toEqual(["visible", "hidden", "missing"]);
    expect(page.items[0].reporterMasked).toBe("#0001");
    expect(page.items[1].reviewId).toBe(20);
  });

  it("미해결 신고가 없으면 빈 목록", async () => {
    reportCount.mockResolvedValue(0);
    reportFindMany.mockResolvedValue([]);
    const page = await listProductReviewReportQueue(1);
    expect(page.items).toEqual([]);
    expect(reviewFindMany).not.toHaveBeenCalled();
  });
});

describe("hideProductReview", () => {
  it("숨김 가능 리뷰면 hidden 스탬프 + 미해결 신고 일괄 처리", async () => {
    txReviewUpdateMany.mockResolvedValue({ count: 1 });
    txReportUpdateMany.mockResolvedValue({ count: 2 });
    await hideProductReview("admin-1", { reviewId: 7, reason: "욕설" });
    const reviewArg = txReviewUpdateMany.mock.calls[0][0];
    expect(reviewArg.data.hiddenBy).toBe("admin-1");
    expect(reviewArg.data.hiddenReason).toBe("욕설");
    const reportArg = txReportUpdateMany.mock.calls[0][0];
    expect(reportArg.data.resolution).toBe("actioned");
  });

  it("숨길 수 없는 상태면 거부하고 신고를 건드리지 않는다", async () => {
    txReviewUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      hideProductReview("admin-1", { reviewId: 7, reason: "욕설" }),
    ).rejects.toThrow(/숨길 수 없는/);
    expect(txReportUpdateMany).not.toHaveBeenCalled();
  });
});

describe("unhideProductReview", () => {
  it("숨김 리뷰면 노출로 복원", async () => {
    reviewUpdateMany.mockResolvedValue({ count: 1 });
    await unhideProductReview("admin-1", 7);
    const arg = reviewUpdateMany.mock.calls[0][0];
    expect(arg.data.hiddenAt).toBeNull();
  });

  it("숨김 상태가 아니면 거부", async () => {
    reviewUpdateMany.mockResolvedValue({ count: 0 });
    await expect(unhideProductReview("admin-1", 7)).rejects.toThrow(/해제할 수 없는/);
  });
});

describe("dismissProductReviewReport", () => {
  it("미해결 신고를 dismissed 로 처리", async () => {
    reportUpdateMany.mockResolvedValue({ count: 1 });
    await dismissProductReviewReport("admin-1", { reportId: 3, note: "무혐의" });
    const arg = reportUpdateMany.mock.calls[0][0];
    expect(arg.data.resolution).toBe("dismissed");
    expect(arg.data.resolutionNote).toBe("무혐의");
  });

  it("이미 처리된 신고면 거부", async () => {
    reportUpdateMany.mockResolvedValue({ count: 0 });
    await expect(dismissProductReviewReport("admin-1", { reportId: 3 })).rejects.toThrow(/이미 처리된/);
  });

  it("countUnresolvedProductReviewReports 는 미해결 수를 센다", async () => {
    reportCount.mockResolvedValue(4);
    expect(await countUnresolvedProductReviewReports()).toBe(4);
    expect(reportCount).toHaveBeenCalledWith({ where: { resolvedAt: null } });
  });
});
