/** 찜 알림 판정에 필요한 상품 스냅샷 — 수정 전/후 비교용. */
export type WishAlertSnapshot = {
  salePrice: number;
  stockQuantity: number;
  saleStatus: string;
  saleMode: string;
  auctionStatus: string | null;
};

export type WishlistEvent = {
  kind: "price_drop" | "restock" | "auction_started";
  title: string;
  body: string;
};

/**
 * 수정 전/후 스냅샷을 비교해 찜 이용자에게 알릴 이벤트를 뽑는다(순수 함수).
 * - 가격 인하: 판매중 고정가 상품의 salePrice가 내려감
 * - 재입고: 재고 0 → 1 이상 (판매중)
 * - 경매 시작: 경매 진행중(live) 상태로 새로 전환
 */
export function detectWishlistEvents(
  productName: string,
  before: WishAlertSnapshot,
  after: WishAlertSnapshot,
): WishlistEvent[] {
  const events: WishlistEvent[] = [];
  if (after.saleStatus !== "active") return events;

  const becameLive =
    after.saleMode === "auction" &&
    after.auctionStatus === "live" &&
    !(before.saleMode === "auction" && before.auctionStatus === "live");
  if (becameLive) {
    events.push({
      kind: "auction_started",
      title: "찜한 카드가 경매로 나왔어요",
      body: `${productName} — 입찰 경매가 시작됐어요. 시작가부터 노려보세요!`,
    });
    // 경매 전환이면 가격 인하·재입고 알림은 노이즈 — 경매 알림만 보낸다.
    return events;
  }

  if (
    after.saleMode === "fixed" &&
    after.stockQuantity > 0 &&
    after.salePrice < before.salePrice
  ) {
    events.push({
      kind: "price_drop",
      title: "찜한 카드 가격이 내려갔어요",
      body: `${productName} — ₩${before.salePrice.toLocaleString()} → ₩${after.salePrice.toLocaleString()}`,
    });
  }

  if (before.stockQuantity === 0 && after.stockQuantity > 0) {
    events.push({
      kind: "restock",
      title: "찜한 카드가 재입고됐어요",
      body: `${productName} — 다시 구매할 수 있어요. 서두르세요!`,
    });
  }

  return events;
}
