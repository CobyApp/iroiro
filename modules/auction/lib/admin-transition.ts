// 관리자 상품 생성/수정 시 경매 필드 전이 계획 — 순수 함수 (테스트 가능).
// 규칙:
//  - 경매 상품은 재고 1개 고정, 정가/판매가 = 시작가(낙찰 시 낙찰가로 갱신).
//  - 입찰이 시작되면(bidCount>0) 시작가 변경 불가. 마감 연장은 허용.
//  - 유찰(passed) 상품은 마감을 미래로 다시 잡으면 재경매(카운터 초기화).
//  - 낙찰 대기(awarded) 중에는 고정가 전환·시작가 변경 불가.

export type AuctionExisting = {
  saleMode: string;
  auctionStatus: string | null;
  auctionStartPrice: number | null;
  auctionBidCount: number;
  auctionEndsAt: Date | null;
  regularPrice: number;
};

export type AuctionInput = {
  saleMode?: string;
  auctionStartPrice?: number | null;
  auctionEndsAt?: string | null;
};

export type AuctionPatch = {
  saleMode?: string;
  auctionStartPrice?: number | null;
  auctionCurrentPrice?: number | null;
  auctionBidCount?: number;
  auctionEndsAt?: Date | null;
  auctionStatus?: string | null;
  auctionWinnerAccountId?: string | null;
  auctionPayDueAt?: Date | null;
  stockQuantity?: number;
  regularPrice?: number;
  salePrice?: number;
};

export type AuctionPlan =
  | { ok: true; patch: AuctionPatch }
  | { ok: false; error: string };

/** 신규 생성 — saleMode='auction'일 때 파생 필드 계획. */
export function planAuctionCreate(
  input: { auctionStartPrice?: number | null; auctionEndsAt?: string | null },
  now: Date,
): AuctionPlan {
  const startPrice = input.auctionStartPrice ?? null;
  const endsAt = input.auctionEndsAt ? new Date(input.auctionEndsAt) : null;
  if (startPrice === null || endsAt === null) {
    return { ok: false, error: "경매 시작가와 마감 시각을 입력해 주세요" };
  }
  if (endsAt.getTime() <= now.getTime()) {
    return { ok: false, error: "경매 마감 시각은 미래여야 합니다" };
  }
  return {
    ok: true,
    patch: {
      saleMode: "auction",
      auctionStartPrice: startPrice,
      auctionCurrentPrice: null,
      auctionBidCount: 0,
      auctionEndsAt: endsAt,
      auctionStatus: "live",
      auctionWinnerAccountId: null,
      auctionPayDueAt: null,
      stockQuantity: 1,
      regularPrice: startPrice,
      salePrice: startPrice,
    },
  };
}

/** 수정 — 기존 상태와 입력으로 전이 계획. 경매 관련 입력이 없으면 빈 패치. */
export function planAuctionUpdate(
  existing: AuctionExisting,
  input: AuctionInput,
  now: Date,
): AuctionPlan {
  const touched =
    input.saleMode !== undefined ||
    input.auctionStartPrice !== undefined ||
    input.auctionEndsAt !== undefined;
  if (!touched) return { ok: true, patch: {} };

  const nextMode = input.saleMode ?? existing.saleMode;

  // 경매 → 고정가 전환
  if (existing.saleMode === "auction" && nextMode === "fixed") {
    if (existing.auctionStatus === "awarded") {
      return { ok: false, error: "낙찰 결제 대기 중에는 고정가로 전환할 수 없습니다" };
    }
    if (existing.auctionStatus === "live" && existing.auctionBidCount > 0) {
      return { ok: false, error: "입찰이 있는 경매는 고정가로 전환할 수 없습니다" };
    }
    return {
      ok: true,
      patch: {
        saleMode: "fixed",
        auctionStartPrice: null,
        auctionCurrentPrice: null,
        auctionBidCount: 0,
        auctionEndsAt: null,
        auctionStatus: null,
        auctionWinnerAccountId: null,
        auctionPayDueAt: null,
      },
    };
  }

  if (nextMode !== "auction") return { ok: true, patch: {} };

  const startPrice = input.auctionStartPrice ?? existing.auctionStartPrice;
  const endsAt = input.auctionEndsAt
    ? new Date(input.auctionEndsAt)
    : existing.auctionEndsAt;
  if (startPrice === null || endsAt === null) {
    return { ok: false, error: "경매 시작가와 마감 시각을 입력해 주세요" };
  }

  const isNewAuction = existing.saleMode !== "auction";
  const isRelist = existing.saleMode === "auction" && existing.auctionStatus === "passed";

  if (isNewAuction || isRelist) {
    // 고정가 → 경매 전환 또는 유찰 재경매: 카운터 초기화 후 다시 시작.
    if (endsAt.getTime() <= now.getTime()) {
      return { ok: false, error: "경매 마감 시각은 미래여야 합니다" };
    }
    return {
      ok: true,
      patch: {
        saleMode: "auction",
        auctionStartPrice: startPrice,
        auctionCurrentPrice: null,
        auctionBidCount: 0,
        auctionEndsAt: endsAt,
        auctionStatus: "live",
        auctionWinnerAccountId: null,
        auctionPayDueAt: null,
        stockQuantity: 1,
        regularPrice: startPrice,
        salePrice: startPrice,
      },
    };
  }

  if (existing.auctionStatus === "awarded") {
    return { ok: false, error: "낙찰 결제 대기 중에는 경매 설정을 변경할 수 없습니다" };
  }

  // 진행 중(live) 경매 수정
  if (existing.auctionBidCount > 0 && startPrice !== existing.auctionStartPrice) {
    return { ok: false, error: "입찰이 시작된 경매의 시작가는 변경할 수 없습니다" };
  }
  const patch: AuctionPatch = {
    auctionStartPrice: startPrice,
    auctionEndsAt: endsAt,
    stockQuantity: 1,
  };
  if (existing.auctionBidCount === 0) {
    patch.regularPrice = startPrice;
    patch.salePrice = startPrice;
  }
  return { ok: true, patch };
}
