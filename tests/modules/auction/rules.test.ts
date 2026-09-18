import { describe, expect, it } from "vitest";
import {
  bidIncrementFor,
  evaluateBid,
  extendedEndsAt,
  minNextBid,
  payDueFrom,
  remainingLabel,
  validateBidAmount,
} from "@/modules/auction/lib/rules";

describe("bidIncrementFor", () => {
  it("가격대별 인상폭 500/1000/5000", () => {
    expect(bidIncrementFor(6000)).toBe(500);
    expect(bidIncrementFor(19999)).toBe(500);
    expect(bidIncrementFor(20000)).toBe(1000);
    expect(bidIncrementFor(99999)).toBe(1000);
    expect(bidIncrementFor(100000)).toBe(5000);
  });
});

describe("minNextBid", () => {
  it("첫 입찰은 시작가부터", () => {
    expect(minNextBid(null, 3000)).toBe(3000);
  });
  it("이후엔 현재가 + 인상폭", () => {
    expect(minNextBid(6000, 3000)).toBe(6500);
    expect(minNextBid(25000, 3000)).toBe(26000);
  });
});

describe("extendedEndsAt (스나이핑 방지)", () => {
  const now = new Date("2026-08-21T12:00:00Z");
  it("마감 5분 이내 입찰이면 지금+5분으로 연장", () => {
    const endsAt = new Date("2026-08-21T12:03:00Z");
    expect(extendedEndsAt(endsAt, now)?.toISOString()).toBe(
      "2026-08-21T12:05:00.000Z",
    );
  });
  it("여유가 있으면 연장 없음", () => {
    expect(extendedEndsAt(new Date("2026-08-21T12:06:00Z"), now)).toBeNull();
  });
  it("이미 지난 마감은 연장 없음", () => {
    expect(extendedEndsAt(new Date("2026-08-21T11:59:00Z"), now)).toBeNull();
  });
});

describe("payDueFrom", () => {
  it("낙찰 후 48시간", () => {
    expect(payDueFrom(new Date("2026-08-21T12:00:00Z")).toISOString()).toBe(
      "2026-08-23T12:00:00.000Z",
    );
  });
});

describe("remainingLabel", () => {
  const now = new Date("2026-08-21T12:00:00Z");
  it("일/시간/분 단위 라벨", () => {
    expect(remainingLabel("2026-08-23T15:00:00Z", now)).toBe("2일 3시간");
    expect(remainingLabel("2026-08-21T15:12:00Z", now)).toBe("3시간 12분");
    expect(remainingLabel("2026-08-21T12:05:00Z", now)).toBe("5분");
    expect(remainingLabel("2026-08-21T11:00:00Z", now)).toBe("마감");
  });
});

describe("validateBidAmount", () => {
  it("최소 입찰가 미만 거부", () => {
    expect(validateBidAmount(2999, null, 3000)).toContain("₩3,000");
    expect(validateBidAmount(6400, 6000, 3000)).toContain("₩6,500");
  });
  it("유효 금액은 통과", () => {
    expect(validateBidAmount(3000, null, 3000)).toBeNull();
    expect(validateBidAmount(7000, 6000, 3000)).toBeNull();
  });
  it("정수 아닌 금액 거부", () => {
    expect(validateBidAmount(0.5, null, 3000)).toBeTruthy();
    expect(validateBidAmount(-1, null, 3000)).toBeTruthy();
  });
});

describe("evaluateBid (잠금 후 최신값 판정)", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  const live = {
    saleMode: "auction",
    saleStatus: "active",
    auctionStatus: "live",
    startPrice: 3000,
    currentPrice: 6000,
    endsAt: new Date("2026-08-24T13:00:00Z"),
  };

  it("경합으로 오른 현재가 기준 최소가 미만이면 새 최소가를 안내하며 거절", () => {
    const v = evaluateBid(live, 6400, now);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error).toContain("₩6,000");
      expect(v.error).toContain("₩6,500");
    }
  });

  it("유효 입찰은 통과, 마감 5분 전이면 연장 시각 반환", () => {
    const v = evaluateBid(live, 6500, now);
    expect(v).toEqual({ ok: true, extendedEndsAt: null });

    const nearEnd = { ...live, endsAt: new Date("2026-08-24T12:03:00Z") };
    const v2 = evaluateBid(nearEnd, 6500, now);
    expect(v2.ok).toBe(true);
    if (v2.ok) {
      expect(v2.extendedEndsAt?.toISOString()).toBe("2026-08-24T12:05:00.000Z");
    }
  });

  it("마감 경과·비활성·유찰 상태는 종료로 거절", () => {
    expect(
      evaluateBid({ ...live, endsAt: new Date("2026-08-24T11:59:00Z") }, 9999999, now).ok,
    ).toBe(false);
    expect(evaluateBid({ ...live, auctionStatus: "awarded" }, 6500, now).ok).toBe(false);
    expect(evaluateBid({ ...live, saleStatus: "draft" }, 6500, now).ok).toBe(false);
  });

  it("첫 입찰은 시작가부터", () => {
    const fresh = { ...live, currentPrice: null };
    expect(evaluateBid(fresh, 2999, now).ok).toBe(false);
    expect(evaluateBid(fresh, 3000, now)).toEqual({ ok: true, extendedEndsAt: null });
  });
});
