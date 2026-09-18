import { describe, expect, it } from "vitest";
import {
  planAuctionCreate,
  planAuctionUpdate,
  type AuctionExisting,
} from "@/modules/auction/lib/admin-transition";

const now = new Date("2026-08-21T12:00:00Z");
const future = "2026-08-25T12:00:00.000Z";
const past = "2026-08-20T12:00:00.000Z";

const fixedExisting: AuctionExisting = {
  saleMode: "fixed",
  auctionStatus: null,
  auctionStartPrice: null,
  auctionBidCount: 0,
  auctionEndsAt: null,
  regularPrice: 10000,
};

const liveExisting: AuctionExisting = {
  saleMode: "auction",
  auctionStatus: "live",
  auctionStartPrice: 3000,
  auctionBidCount: 0,
  auctionEndsAt: new Date(future),
  regularPrice: 3000,
};

describe("planAuctionCreate", () => {
  it("시작가·마감으로 live 경매 초기화 (재고 1, 가격=시작가)", () => {
    const plan = planAuctionCreate(
      { auctionStartPrice: 3000, auctionEndsAt: future },
      now,
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.patch).toMatchObject({
        saleMode: "auction",
        auctionStatus: "live",
        auctionStartPrice: 3000,
        stockQuantity: 1,
        regularPrice: 3000,
        salePrice: 3000,
        auctionBidCount: 0,
      });
    }
  });

  it("필수값 누락·과거 마감 거부", () => {
    expect(planAuctionCreate({ auctionStartPrice: 3000 }, now).ok).toBe(false);
    expect(
      planAuctionCreate({ auctionStartPrice: 3000, auctionEndsAt: past }, now)
        .ok,
    ).toBe(false);
  });
});

describe("planAuctionUpdate", () => {
  it("경매 입력이 없으면 빈 패치", () => {
    const plan = planAuctionUpdate(liveExisting, {}, now);
    expect(plan).toEqual({ ok: true, patch: {} });
  });

  it("고정가 → 경매 전환은 카운터 초기화", () => {
    const plan = planAuctionUpdate(
      fixedExisting,
      { saleMode: "auction", auctionStartPrice: 5000, auctionEndsAt: future },
      now,
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.patch).toMatchObject({
        auctionStatus: "live",
        auctionCurrentPrice: null,
        auctionBidCount: 0,
        stockQuantity: 1,
        salePrice: 5000,
      });
    }
  });

  it("입찰 시작 후 시작가 변경 불가, 마감 연장은 가능", () => {
    const withBids = { ...liveExisting, auctionBidCount: 5 };
    const changePrice = planAuctionUpdate(
      withBids,
      { auctionStartPrice: 4000 },
      now,
    );
    expect(changePrice.ok).toBe(false);

    const extend = planAuctionUpdate(
      withBids,
      { auctionEndsAt: "2026-08-30T12:00:00.000Z" },
      now,
    );
    expect(extend.ok).toBe(true);
    if (extend.ok) {
      expect(extend.patch.auctionEndsAt?.toISOString()).toBe(
        "2026-08-30T12:00:00.000Z",
      );
      // 입찰이 있으면 가격은 건드리지 않는다(현재가 기반 salePrice 유지).
      expect(extend.patch.salePrice).toBeUndefined();
    }
  });

  it("입찰 있는 live 경매는 고정가 전환 불가, 입찰 없으면 가능", () => {
    expect(
      planAuctionUpdate(
        { ...liveExisting, auctionBidCount: 2 },
        { saleMode: "fixed" },
        now,
      ).ok,
    ).toBe(false);
    const plan = planAuctionUpdate(liveExisting, { saleMode: "fixed" }, now);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.patch.saleMode).toBe("fixed");
  });

  it("낙찰 대기(awarded)엔 설정 변경·전환 불가", () => {
    const awarded: AuctionExisting = {
      ...liveExisting,
      auctionStatus: "awarded",
      auctionBidCount: 3,
    };
    expect(planAuctionUpdate(awarded, { saleMode: "fixed" }, now).ok).toBe(false);
    expect(
      planAuctionUpdate(awarded, { auctionEndsAt: future }, now).ok,
    ).toBe(false);
  });

  it("유찰(passed) 상품은 미래 마감으로 재경매(초기화)", () => {
    const passed: AuctionExisting = {
      ...liveExisting,
      auctionStatus: "passed",
      auctionBidCount: 4,
    };
    const plan = planAuctionUpdate(passed, { auctionEndsAt: future }, now);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.patch).toMatchObject({
        auctionStatus: "live",
        auctionBidCount: 0,
        auctionCurrentPrice: null,
        auctionWinnerAccountId: null,
      });
    }
  });
});
