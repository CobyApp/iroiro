import { beforeEach, describe, expect, it, vi } from "vitest";

// ── @/lib/db 목 — report.ts 는 db as defaultDb 를 기본 인자로 쓴다(인자 생략 시 이 목 사용) ──
// report.ts 의 static import 가 훅으로 끌어올려지므로, 목 함수도 vi.hoisted 로 먼저 초기화한다.
const {
  usedReportCount,
  usedReportFindMany,
  usedReportUpdateMany,
  usedReportGroupBy,
  usedListingCount,
  usedListingFindMany,
  usedListingUpdateMany,
  usedPhotoFindMany,
  accountFindMany,
  transaction,
  txQueryRaw,
  txPhotoFindFirst,
  txReportCreate,
  txListingUpdateMany,
  txReportUpdateMany,
} = vi.hoisted(() => ({
  usedReportCount: vi.fn(),
  usedReportFindMany: vi.fn(),
  usedReportUpdateMany: vi.fn(),
  usedReportGroupBy: vi.fn(),
  usedListingCount: vi.fn(),
  usedListingFindMany: vi.fn(),
  usedListingUpdateMany: vi.fn(),
  usedPhotoFindMany: vi.fn(),
  accountFindMany: vi.fn(),
  transaction: vi.fn(),
  txQueryRaw: vi.fn(),
  txPhotoFindFirst: vi.fn(),
  txReportCreate: vi.fn(),
  txListingUpdateMany: vi.fn(),
  txReportUpdateMany: vi.fn(),
}));

function fakeTx() {
  return {
    $queryRaw: txQueryRaw,
    usedListingPhoto: { findFirst: txPhotoFindFirst },
    usedReport: { create: txReportCreate, updateMany: txReportUpdateMany },
    usedListing: { updateMany: txListingUpdateMany },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    usedReport: {
      count: usedReportCount,
      findMany: usedReportFindMany,
      updateMany: usedReportUpdateMany,
      groupBy: usedReportGroupBy,
    },
    usedListing: {
      count: usedListingCount,
      findMany: usedListingFindMany,
      updateMany: usedListingUpdateMany,
    },
    usedListingPhoto: { findMany: usedPhotoFindMany },
    account: { findMany: accountFindMany },
    $transaction: transaction,
  },
}));

import {
  blockUsedListing,
  countUnresolvedUsedReports,
  countUsedListingsByStatus,
  createUsedReport,
  dismissUsedReport,
  listAdminUsedListings,
  listUsedReportQueue,
  unblockUsedListing,
} from "@/modules/used/lib/report";

const REPORTER = "11111111-1111-1111-1111-111111111111";
const SELLER = "99999999-9999-9999-9999-999999999999";

function listingRow(over: Record<string, unknown> = {}) {
  return {
    seller_account_id: SELLER,
    title: "포카 판매",
    description: "상태 좋음",
    price: 12000,
    sale_mode: "fixed",
    seller_name: "판매자",
    seller_code: "SELL0001",
    updated_at: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usedReportCount.mockResolvedValue(0); // rate limit 통과
  transaction.mockImplementation(async (cb: (tx: ReturnType<typeof fakeTx>) => unknown) => cb(fakeTx()));
  txPhotoFindFirst.mockResolvedValue({ r2Key: "used/clean/abc.jpg" });
  txReportCreate.mockResolvedValue({});
});

describe("createUsedReport", () => {
  it("대상 매물이 없거나 차단·취소면 신고할 수 없다", async () => {
    txQueryRaw.mockResolvedValue([]);
    await expect(
      createUsedReport(REPORTER, { listingId: 5, reason: "spam" }),
    ).rejects.toThrow(/신고할 수 없는 매물/);
  });

  it("본인 매물은 신고할 수 없다", async () => {
    txQueryRaw.mockResolvedValue([listingRow({ seller_account_id: REPORTER })]);
    await expect(
      createUsedReport(REPORTER, { listingId: 5, reason: "spam" }),
    ).rejects.toThrow(/본인 매물/);
    expect(txReportCreate).not.toHaveBeenCalled();
  });

  it("정상 신고 — 스냅샷을 동결해 생성한다", async () => {
    txQueryRaw.mockResolvedValue([listingRow()]);
    await createUsedReport(REPORTER, { listingId: 5, reason: "counterfeit", detail: "가품" });
    expect(txReportCreate).toHaveBeenCalledTimes(1);
    const arg = txReportCreate.mock.calls[0][0];
    expect(arg.data.reason).toBe("counterfeit");
    expect(arg.data.detail).toBe("가품");
    expect(arg.data.reporterAccountId).toBe(REPORTER);
    expect(arg.data.snapshot).toMatchObject({
      version: 1,
      title: "포카 판매",
      price: 12000,
      saleMode: "fixed",
      sellerName: "판매자",
      sellerCode: "SELL0001",
      primaryPhotoKey: "used/clean/abc.jpg",
    });
  });

  it("중복 신고(P2002 listing_id)는 도메인 메시지로 변환한다", async () => {
    txQueryRaw.mockResolvedValue([listingRow()]);
    txReportCreate.mockRejectedValue({
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["listing_id", "reporter_account_id"] },
    });
    await expect(
      createUsedReport(REPORTER, { listingId: 5, reason: "spam" }),
    ).rejects.toThrow(/이미 신고한 매물/);
  });

  it("rate limit 초과면 거부한다", async () => {
    usedReportCount.mockResolvedValue(999);
    await expect(
      createUsedReport(REPORTER, { listingId: 5, reason: "spam" }),
    ).rejects.toThrow(/너무 잦/);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("listUsedReportQueue", () => {
  it("대상 매물 상태를 큐 표시 상태로 매핑한다", async () => {
    usedReportCount.mockResolvedValue(3);
    usedReportFindMany.mockResolvedValue([
      { id: 1n, listingId: 10n, reason: "spam", detail: null, snapshot: { version: 1, title: "a" }, reporterAccountId: "aaaabbbbccccddddeeee0001", createdAt: new Date("2026-09-01T00:00:00Z") },
      { id: 2n, listingId: 20n, reason: "fraud", detail: "x", snapshot: { version: 1, title: "b" }, reporterAccountId: "aaaabbbbccccddddeeee0002", createdAt: new Date("2026-09-02T00:00:00Z") },
      { id: 3n, listingId: 30n, reason: "other", detail: null, snapshot: { version: 1, title: "c" }, reporterAccountId: "aaaabbbbccccddddeeee0003", createdAt: new Date("2026-09-03T00:00:00Z") },
    ]);
    usedListingFindMany.mockResolvedValue([
      { id: 10n, status: "active" },
      { id: 20n, status: "blocked" },
      // 30 없음 → missing
    ]);
    const page = await listUsedReportQueue(1);
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.targetStatus)).toEqual(["visible", "blocked", "missing"]);
    expect(page.items[0].reporterMasked).toBe("#0001");
    expect(page.items[1].listingId).toBe(20);
  });

  it("미해결 신고가 없으면 빈 목록", async () => {
    usedReportCount.mockResolvedValue(0);
    usedReportFindMany.mockResolvedValue([]);
    const page = await listUsedReportQueue(1);
    expect(page.items).toEqual([]);
    expect(usedListingFindMany).not.toHaveBeenCalled();
  });
});

describe("blockUsedListing", () => {
  it("차단 가능 매물이면 status=blocked + 미해결 신고 일괄 처리", async () => {
    txListingUpdateMany.mockResolvedValue({ count: 1 });
    txReportUpdateMany.mockResolvedValue({ count: 2 });
    await blockUsedListing("admin-1", { listingId: 7, reason: "가품" });
    expect(txListingUpdateMany).toHaveBeenCalledTimes(1);
    const listingArg = txListingUpdateMany.mock.calls[0][0];
    expect(listingArg.data.status).toBe("blocked");
    expect(listingArg.data.blockedBy).toBe("admin-1");
    expect(listingArg.data.blockedReason).toBe("가품");
    const reportArg = txReportUpdateMany.mock.calls[0][0];
    expect(reportArg.data.resolution).toBe("actioned");
  });

  it("차단할 수 없는 상태면 거부하고 신고를 건드리지 않는다", async () => {
    txListingUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      blockUsedListing("admin-1", { listingId: 7, reason: "가품" }),
    ).rejects.toThrow(/차단할 수 없는/);
    expect(txReportUpdateMany).not.toHaveBeenCalled();
  });
});

describe("unblockUsedListing", () => {
  it("차단된 매물이면 active 로 복원", async () => {
    usedListingUpdateMany.mockResolvedValue({ count: 1 });
    await unblockUsedListing("admin-1", 7);
    const arg = usedListingUpdateMany.mock.calls[0][0];
    expect(arg.where.status).toBe("blocked");
    expect(arg.data.status).toBe("active");
    expect(arg.data.blockedAt).toBeNull();
  });

  it("차단 상태가 아니면 거부", async () => {
    usedListingUpdateMany.mockResolvedValue({ count: 0 });
    await expect(unblockUsedListing("admin-1", 7)).rejects.toThrow(/해제할 수 없는/);
  });
});

describe("dismissUsedReport", () => {
  it("미해결 신고를 dismissed 로 처리", async () => {
    usedReportUpdateMany.mockResolvedValue({ count: 1 });
    await dismissUsedReport("admin-1", { reportId: 3, note: "무혐의" });
    const arg = usedReportUpdateMany.mock.calls[0][0];
    expect(arg.where.resolvedAt).toBeNull();
    expect(arg.data.resolution).toBe("dismissed");
    expect(arg.data.resolutionNote).toBe("무혐의");
  });

  it("이미 처리된 신고면 거부", async () => {
    usedReportUpdateMany.mockResolvedValue({ count: 0 });
    await expect(dismissUsedReport("admin-1", { reportId: 3 })).rejects.toThrow(/이미 처리된/);
  });
});

describe("카운트·목록 집계", () => {
  it("countUnresolvedUsedReports 는 미해결 수를 센다", async () => {
    usedReportCount.mockResolvedValue(4);
    expect(await countUnresolvedUsedReports()).toBe(4);
    expect(usedReportCount).toHaveBeenCalledWith({ where: { resolvedAt: null } });
  });

  it("countUsedListingsByStatus 는 활성·차단 수를 센다", async () => {
    usedListingCount.mockResolvedValueOnce(12).mockResolvedValueOnce(3);
    expect(await countUsedListingsByStatus()).toEqual({ active: 12, blocked: 3 });
  });

  it("listAdminUsedListings 는 사진·판매자·미해결 신고 수를 붙인다", async () => {
    usedListingCount.mockResolvedValue(1);
    usedListingFindMany.mockResolvedValue([
      {
        id: 10n,
        title: "포카",
        status: "active",
        saleMode: "fixed",
        price: 5000,
        sellerAccountId: SELLER,
        blockedReason: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
    usedPhotoFindMany.mockResolvedValue([{ listingId: 10n, r2Key: "k.jpg" }]);
    accountFindMany.mockResolvedValue([{ id: SELLER, displayName: "판매자" }]);
    usedReportGroupBy.mockResolvedValue([{ listingId: 10n, _count: { _all: 2 } }]);
    const page = await listAdminUsedListings({ status: "active" });
    expect(page.items[0]).toMatchObject({
      id: 10,
      sellerName: "판매자",
      primaryPhotoKey: "k.jpg",
      openReports: 2,
    });
  });
});
