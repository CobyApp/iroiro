// 경매 규칙 — 순수 함수만 (node 테스트 가능). 메루카리식:
// 로그인 필수 · 입찰 취소 불가 · 최소 인상폭 가격대별 · 마감 직전 입찰 시 자동연장.

/** 마감 직전 입찰 시 스나이핑 방지 연장 창/폭 (메루카리식 5분). */
export const ANTI_SNIPE_WINDOW_MS = 5 * 60 * 1000;

/** 낙찰 후 결제 기한 (48시간). */
export const PAY_DUE_MS = 48 * 60 * 60 * 1000;

/** 가격대별 최소 인상폭. */
export function bidIncrementFor(price: number): number {
  if (price < 20000) return 500;
  if (price < 100000) return 1000;
  return 5000;
}

/** 다음 입찰에 필요한 최소 금액 — 첫 입찰은 시작가부터. */
export function minNextBid(
  currentPrice: number | null,
  startPrice: number,
): number {
  if (currentPrice === null) return startPrice;
  return currentPrice + bidIncrementFor(currentPrice);
}

/**
 * 마감 직전(5분 이내) 입찰이면 연장된 마감 시각을, 아니면 null을 반환.
 * 연장은 항상 "지금 + 5분" — 연속 입찰 시 계속 밀린다.
 */
export function extendedEndsAt(endsAt: Date, now: Date): Date | null {
  const remaining = endsAt.getTime() - now.getTime();
  if (remaining <= 0 || remaining > ANTI_SNIPE_WINDOW_MS) return null;
  return new Date(now.getTime() + ANTI_SNIPE_WINDOW_MS);
}

export function payDueFrom(now: Date): Date {
  return new Date(now.getTime() + PAY_DUE_MS);
}

/** 남은 시간 라벨 — "2일 3시간" / "3시간 12분" / "5분" / "마감". */
export function remainingLabel(endsAtIso: string, now: Date): string {
  const ms = new Date(endsAtIso).getTime() - now.getTime();
  if (ms <= 0) return "마감";
  const minutes = Math.ceil(ms / 60000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}

export type BidEvaluation =
  | { ok: true; extendedEndsAt: Date | null }
  | { ok: false; error: string };

/**
 * 입찰 판정 — 행 잠금(FOR UPDATE) 후 "최신 값"으로 모든 조건을 한 번에 검사한다.
 * 경합으로 현재가가 방금 올랐다면, 새 현재가·최소가를 담은 메시지로 거절해
 * 사용자가 바로 재입찰할 수 있게 한다.
 */
export function evaluateBid(
  state: {
    saleMode: string;
    saleStatus: string;
    auctionStatus: string | null;
    startPrice: number | null;
    currentPrice: number | null;
    endsAt: Date | null;
  },
  amount: number,
  now: Date,
): BidEvaluation {
  if (state.saleMode !== "auction" || state.startPrice === null) {
    return { ok: false, error: "경매 상품이 아닙니다" };
  }
  if (
    state.saleStatus !== "active" ||
    state.auctionStatus !== "live" ||
    state.endsAt === null ||
    state.endsAt.getTime() <= now.getTime()
  ) {
    return { ok: false, error: "종료된 경매입니다" };
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, error: "올바른 금액을 입력해 주세요" };
  }
  const min = minNextBid(state.currentPrice, state.startPrice);
  if (amount < min) {
    return {
      ok: false,
      error:
        state.currentPrice === null
          ? `시작가 ₩${min.toLocaleString()}부터 입찰할 수 있어요`
          : `현재 최고가 ₩${state.currentPrice.toLocaleString()} — 최소 ₩${min.toLocaleString()}부터 입찰할 수 있어요`,
    };
  }
  return { ok: true, extendedEndsAt: extendedEndsAt(state.endsAt, now) };
}

/** 입찰 금액 유효성 — 문제 없으면 null, 있으면 사용자 메시지. */
export function validateBidAmount(
  amount: number,
  currentPrice: number | null,
  startPrice: number,
): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return "올바른 금액을 입력해 주세요";
  }
  const min = minNextBid(currentPrice, startPrice);
  if (amount < min) {
    return `최소 ₩${min.toLocaleString()}부터 입찰할 수 있어요`;
  }
  return null;
}
