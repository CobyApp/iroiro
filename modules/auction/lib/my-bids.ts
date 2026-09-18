import "server-only";

import { db } from "@/lib/db";

// 내 입찰 현황 — 마이페이지 입찰 내역·홈 '내 입찰' 스트립 공용.
// 상품 상세(사진 등)는 소비 측 페이지가 getProductsByIds로 합성한다(도메인 결합 회피).

/** 내 입찰 한 건(상품 단위)의 상태. */
export type MyBidStatus =
  | "winning" // 진행중 — 내가 최고가
  | "outbid" // 진행중 — 추월당함
  | "awarded_unpaid" // 낙찰 — 결제 대기(기한 내)
  | "purchased" // 낙찰 — 결제 완료
  | "lost" // 종료 — 다른 사람이 낙찰
  | "expired" // 낙찰됐지만 기한 내 미결제로 취소됨(현재 유찰 상태)
  | "passed"; // 유찰

export const MY_BID_STATUS_LABEL: Record<MyBidStatus, string> = {
  winning: "최고가 진행중",
  outbid: "추월당함",
  awarded_unpaid: "낙찰 · 결제 대기",
  purchased: "구매 완료",
  lost: "낙찰 실패",
  expired: "기한 만료",
  passed: "유찰",
};

/** 순수 상태 판정 — node 테스트 가능. */
export function resolveMyBidStatus(input: {
  auctionStatus: string | null;
  isTopBidder: boolean;
  isWinner: boolean;
  stockQuantity: number;
}): MyBidStatus {
  if (input.auctionStatus === "live") {
    return input.isTopBidder ? "winning" : "outbid";
  }
  if (input.auctionStatus === "awarded") {
    if (!input.isWinner) return "lost";
    return input.stockQuantity === 0 ? "purchased" : "awarded_unpaid";
  }
  // passed — 내가 최고가였다면 (기한 만료로) 취소된 것.
  return input.isTopBidder ? "expired" : "passed";
}

export type MyBidSummary = {
  productId: number;
  /** 내 최고 입찰가 */
  myMaxBid: number;
  status: MyBidStatus;
  /** 현재(또는 낙찰) 최고가 */
  currentPrice: number | null;
  endsAt: string | null;
  payDueAt: string | null;
};

const STATUS_ORDER: Record<MyBidStatus, number> = {
  awarded_unpaid: 0,
  winning: 1,
  outbid: 2,
  purchased: 3,
  expired: 4,
  lost: 5,
  passed: 6,
};

/** 내가 입찰한 상품별 요약 — 결제 대기 → 진행중 → 종료 순. */
export async function listMyBidSummaries(
  accountId: string,
): Promise<MyBidSummary[]> {
  const grouped = await db.auctionBid.groupBy({
    by: ["productId"],
    where: { accountId },
    _max: { amount: true },
  });
  if (grouped.length === 0) return [];
  const productIds = grouped.map((g) => g.productId);
  const myMaxByProduct = new Map(
    grouped.map((g) => [Number(g.productId), g._max.amount ?? 0]),
  );

  const [products, topBids] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        auctionStatus: true,
        auctionCurrentPrice: true,
        auctionEndsAt: true,
        auctionPayDueAt: true,
        auctionWinnerAccountId: true,
        stockQuantity: true,
      },
    }),
    // 상품별 최고 입찰 1건 — distinct + 정렬로 top-1.
    db.auctionBid.findMany({
      where: { productId: { in: productIds } },
      orderBy: [{ amount: "desc" }, { id: "asc" }],
      distinct: ["productId"],
      select: { productId: true, accountId: true },
    }),
  ]);
  const topBidderByProduct = new Map(
    topBids.map((b) => [Number(b.productId), b.accountId]),
  );

  const summaries = products.map((p): MyBidSummary => {
    const productId = Number(p.id);
    const status = resolveMyBidStatus({
      auctionStatus: p.auctionStatus,
      isTopBidder: topBidderByProduct.get(productId) === accountId,
      isWinner: p.auctionWinnerAccountId === accountId,
      stockQuantity: p.stockQuantity,
    });
    return {
      productId,
      myMaxBid: myMaxByProduct.get(productId) ?? 0,
      status,
      currentPrice: p.auctionCurrentPrice,
      endsAt: p.auctionEndsAt?.toISOString() ?? null,
      payDueAt: p.auctionPayDueAt?.toISOString() ?? null,
    };
  });

  return summaries.sort((a, b) => {
    const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (order !== 0) return order;
    // 같은 그룹 안에선 마감 임박(또는 최근) 순.
    return (a.endsAt ?? "").localeCompare(b.endsAt ?? "");
  });
}

/** 홈 스트립용 — 지금 액션이 필요한 것만(결제 대기 + 진행중). */
export function activeBidSummaries(summaries: MyBidSummary[]): MyBidSummary[] {
  return summaries.filter((s) =>
    ["awarded_unpaid", "winning", "outbid"].includes(s.status),
  );
}
