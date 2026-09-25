import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 팩토리는 파일 상단으로 hoist 되므로, 참조 변수도 vi.hoisted 로 함께 끌어올린다.
const {
  notify,
  tradeFindManyTop,
  tradeFindUniqueTop,
  bundleFindManyTop,
  tradeUpdateMany,
  tradeFindUniqueOrThrow,
  tradeFindManyTx,
  listingUpdate,
  listingUpdateMany,
  bundleUpdateMany,
  bundleFindUniqueOrThrow,
} = vi.hoisted(() => ({
  notify: vi.fn(),
  tradeFindManyTop: vi.fn(),
  tradeFindUniqueTop: vi.fn(),
  bundleFindManyTop: vi.fn(),
  tradeUpdateMany: vi.fn(),
  tradeFindUniqueOrThrow: vi.fn(),
  tradeFindManyTx: vi.fn(),
  listingUpdate: vi.fn(),
  listingUpdateMany: vi.fn(),
  bundleUpdateMany: vi.fn(),
  bundleFindUniqueOrThrow: vi.fn(),
}));

vi.mock("@/modules/notifications/lib/notify", () => ({ notify }));

vi.mock("@/lib/db", () => ({
  db: {
    usedTrade: { findMany: tradeFindManyTop, findUnique: tradeFindUniqueTop },
    usedBundle: { findMany: bundleFindManyTop },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        usedTrade: {
          updateMany: tradeUpdateMany,
          findUniqueOrThrow: tradeFindUniqueOrThrow,
          findMany: tradeFindManyTx,
        },
        usedBundle: {
          updateMany: bundleUpdateMany,
          findUniqueOrThrow: bundleFindUniqueOrThrow,
        },
        usedListing: { update: listingUpdate, updateMany: listingUpdateMany },
      }),
  },
}));

import {
  autoConfirmDueUsedTrades,
  autoConfirmUsedBundleIfDue,
  autoConfirmUsedTradeIfDue,
  AUTO_CONFIRM_MS,
} from "@/modules/used/lib/settle-trade";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autoConfirmUsedTradeIfDue", () => {
  it("기한 지난 발송 건을 완료로 전이하고 매물을 판매완료로 마감·양측에 알림", async () => {
    tradeUpdateMany.mockResolvedValue({ count: 1 });
    tradeFindUniqueOrThrow.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      buyerAccountId: "buyer",
      sellerAccountId: "seller",
    });

    const result = await autoConfirmUsedTradeIfDue(1);

    expect(result).toBe(true);
    // shipped + shippedAt <= cutoff + bundleId null 가드로만 전이.
    const where = tradeUpdateMany.mock.calls[0][0].where;
    expect(where.status).toBe("shipped");
    expect(where.bundleId).toBeNull();
    expect(where.shippedAt.lte).toBeInstanceOf(Date);
    expect(listingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "sold" }) }),
    );
    expect(notify).toHaveBeenCalledTimes(2); // 구매자 + 판매자
  });

  it("기한 전(전이 없음)이면 false, 매물 마감·알림 없음", async () => {
    tradeUpdateMany.mockResolvedValue({ count: 0 });

    const result = await autoConfirmUsedTradeIfDue(1);

    expect(result).toBe(false);
    expect(listingUpdate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("커트오프는 now − AUTO_CONFIRM_MS 다", async () => {
    tradeUpdateMany.mockResolvedValue({ count: 0 });
    const now = new Date("2026-09-23T00:00:00Z");
    await autoConfirmUsedTradeIfDue(1, now);
    const lte = tradeUpdateMany.mock.calls[0][0].where.shippedAt.lte as Date;
    expect(lte.getTime()).toBe(now.getTime() - AUTO_CONFIRM_MS);
  });
});

describe("autoConfirmUsedBundleIfDue", () => {
  it("묶음과 소속 매물을 모두 마감하고 알림", async () => {
    bundleUpdateMany.mockResolvedValue({ count: 1 });
    bundleFindUniqueOrThrow.mockResolvedValue({
      id: 3n,
      buyerAccountId: "buyer",
      sellerAccountId: "seller",
    });
    tradeFindManyTx.mockResolvedValue([{ listingId: 10n }, { listingId: 11n }]);

    const result = await autoConfirmUsedBundleIfDue(3);

    expect(result).toBe(true);
    expect(listingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "sold" }) }),
    );
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("autoConfirmDueUsedTrades (스윕)", () => {
  it("기한 지난 단건·묶음 건수를 합산해 반환한다", async () => {
    // 스윕은 usedTrade.findMany 를 순서대로 호출: 택배 shipped → 직거래 handed_over → 직거래 미전달.
    // 첫 호출(택배)만 대상이 있고 직거래 쿼리는 비운다.
    tradeFindManyTop.mockResolvedValueOnce([{ id: 1n }]).mockResolvedValue([]);
    bundleFindManyTop.mockResolvedValue([{ id: 3n }]);
    // 단건 전이
    tradeUpdateMany.mockResolvedValue({ count: 1 });
    tradeFindUniqueOrThrow.mockResolvedValue({
      id: 1n,
      listingId: 10n,
      buyerAccountId: "b",
      sellerAccountId: "s",
    });
    // 묶음 전이
    bundleUpdateMany.mockResolvedValue({ count: 1 });
    bundleFindUniqueOrThrow.mockResolvedValue({
      id: 3n,
      buyerAccountId: "b",
      sellerAccountId: "s",
    });
    tradeFindManyTx.mockResolvedValue([{ listingId: 11n }]);

    const confirmed = await autoConfirmDueUsedTrades();

    expect(confirmed).toBe(2);
    // 단건 스윕은 bundleId NULL 만 대상.
    expect(tradeFindManyTop.mock.calls[0][0].where.bundleId).toBeNull();
  });
});
