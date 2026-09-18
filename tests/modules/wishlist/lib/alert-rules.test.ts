import { describe, expect, it } from "vitest";
import {
  detectWishlistEvents,
  type WishAlertSnapshot,
} from "@/modules/wishlist/lib/alert-rules";

const base: WishAlertSnapshot = {
  salePrice: 10000,
  stockQuantity: 1,
  saleStatus: "active",
  saleMode: "fixed",
  auctionStatus: null,
};

describe("detectWishlistEvents", () => {
  it("가격 인하 → price_drop (이전·이후 가격 포함)", () => {
    const events = detectWishlistEvents("카드A", base, {
      ...base,
      salePrice: 8000,
    });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("price_drop");
    expect(events[0].body).toContain("10,000");
    expect(events[0].body).toContain("8,000");
  });

  it("가격 인상·동일은 무이벤트", () => {
    expect(
      detectWishlistEvents("카드A", base, { ...base, salePrice: 12000 }),
    ).toHaveLength(0);
    expect(detectWishlistEvents("카드A", base, { ...base })).toHaveLength(0);
  });

  it("재고 0 → 1 이상이면 restock", () => {
    const events = detectWishlistEvents(
      "카드A",
      { ...base, stockQuantity: 0 },
      { ...base, stockQuantity: 2 },
    );
    expect(events.map((e) => e.kind)).toEqual(["restock"]);
  });

  it("경매 시작(live 전환)이면 auction_started 하나만", () => {
    const events = detectWishlistEvents(
      "카드A",
      { ...base, stockQuantity: 0 },
      {
        ...base,
        saleMode: "auction",
        auctionStatus: "live",
        salePrice: 5000,
        stockQuantity: 1,
      },
    );
    expect(events.map((e) => e.kind)).toEqual(["auction_started"]);
  });

  it("이미 live였던 경매는 무이벤트", () => {
    const live: WishAlertSnapshot = {
      ...base,
      saleMode: "auction",
      auctionStatus: "live",
    };
    expect(detectWishlistEvents("카드A", live, { ...live })).toHaveLength(0);
  });

  it("판매중이 아니면(draft·archived) 아무것도 보내지 않는다", () => {
    expect(
      detectWishlistEvents(
        "카드A",
        base,
        { ...base, salePrice: 5000, saleStatus: "archived" },
      ),
    ).toHaveLength(0);
  });

  it("가격 인하 + 재입고 동시면 두 이벤트", () => {
    const events = detectWishlistEvents(
      "카드A",
      { ...base, stockQuantity: 0, salePrice: 10000 },
      { ...base, stockQuantity: 1, salePrice: 9000 },
    );
    expect(events.map((e) => e.kind).sort()).toEqual([
      "price_drop",
      "restock",
    ]);
  });
});
