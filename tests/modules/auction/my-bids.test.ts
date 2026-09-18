import { describe, expect, it } from "vitest";
import { resolveMyBidStatus } from "@/modules/auction/lib/my-bids";

describe("resolveMyBidStatus", () => {
  it("진행중 — 최고가/추월", () => {
    expect(
      resolveMyBidStatus({
        auctionStatus: "live",
        isTopBidder: true,
        isWinner: false,
        stockQuantity: 1,
      }),
    ).toBe("winning");
    expect(
      resolveMyBidStatus({
        auctionStatus: "live",
        isTopBidder: false,
        isWinner: false,
        stockQuantity: 1,
      }),
    ).toBe("outbid");
  });

  it("낙찰 — 결제 대기/구매 완료/낙찰 실패", () => {
    expect(
      resolveMyBidStatus({
        auctionStatus: "awarded",
        isTopBidder: true,
        isWinner: true,
        stockQuantity: 1,
      }),
    ).toBe("awarded_unpaid");
    expect(
      resolveMyBidStatus({
        auctionStatus: "awarded",
        isTopBidder: true,
        isWinner: true,
        stockQuantity: 0,
      }),
    ).toBe("purchased");
    expect(
      resolveMyBidStatus({
        auctionStatus: "awarded",
        isTopBidder: false,
        isWinner: false,
        stockQuantity: 1,
      }),
    ).toBe("lost");
  });

  it("유찰 — 내가 최고가였으면 기한 만료, 아니면 유찰", () => {
    expect(
      resolveMyBidStatus({
        auctionStatus: "passed",
        isTopBidder: true,
        isWinner: false,
        stockQuantity: 1,
      }),
    ).toBe("expired");
    expect(
      resolveMyBidStatus({
        auctionStatus: "passed",
        isTopBidder: false,
        isWinner: false,
        stockQuantity: 1,
      }),
    ).toBe("passed");
  });
});
