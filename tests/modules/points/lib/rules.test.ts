import { describe, expect, it } from "vitest";
import { isCouponUsable, maxUsablePoints } from "@/modules/points/lib/rules";

describe("maxUsablePoints", () => {
  it("잔액과 상품 금액 중 작은 쪽", () => {
    expect(maxUsablePoints(1000, 5000)).toBe(1000);
    expect(maxUsablePoints(5000, 1000)).toBe(1000);
    expect(maxUsablePoints(0, 1000)).toBe(0);
  });

  it("음수는 0으로 정규화", () => {
    expect(maxUsablePoints(-100, 1000)).toBe(0);
  });
});

describe("isCouponUsable", () => {
  const now = new Date("2026-08-24T00:00:00Z");

  it("미사용 + 만료 없음 → 사용 가능", () => {
    expect(isCouponUsable({ usedAt: null, expiresAt: null }, now)).toBe(true);
  });

  it("사용됨 → 불가", () => {
    expect(
      isCouponUsable({ usedAt: "2026-08-01T00:00:00Z", expiresAt: null }, now),
    ).toBe(false);
  });

  it("만료 지남 → 불가, 만료 전 → 가능", () => {
    expect(
      isCouponUsable({ usedAt: null, expiresAt: "2026-08-23T00:00:00Z" }, now),
    ).toBe(false);
    expect(
      isCouponUsable({ usedAt: null, expiresAt: "2026-08-25T00:00:00Z" }, now),
    ).toBe(true);
  });
});
