import { describe, expect, it } from "vitest";
import { jpyToKrwPrice, toRate100 } from "@/modules/products/lib/fx";

describe("toRate100", () => {
  it("1엔당 원 → 100엔당 원(소수 2자리)", () => {
    expect(toRate100(9.5)).toBe(950);
    expect(toRate100(9.512)).toBe(951.2);
  });
});

describe("jpyToKrwPrice", () => {
  it("엔화를 현재 환율(100¥당 원)로 환산 후 500원 단위 반올림", () => {
    // 3000¥ × 9.5 = 28,500 → 그대로 500 배수
    expect(jpyToKrwPrice(3000, 950)).toBe(28500);
    // 315¥ × 9.5 = 2,992.5 → 반올림 3,000
    expect(jpyToKrwPrice(315, 950)).toBe(3000);
    // 330¥ × 9.5 = 3,135 → 가장 가까운 500 배수 3,000
    expect(jpyToKrwPrice(330, 950)).toBe(3000);
  });

  it("환산값이 500 미만이어도 최소 500원", () => {
    expect(jpyToKrwPrice(10, 950)).toBe(500);
  });

  it("가격/환율이 유효하지 않으면 0(가격 미정)", () => {
    expect(jpyToKrwPrice(0, 950)).toBe(0);
    expect(jpyToKrwPrice(3000, 0)).toBe(0);
    expect(jpyToKrwPrice(-100, 950)).toBe(0);
  });

  it("단위를 지정할 수 있다", () => {
    // 1234¥ × 9.5 = 11,723 → 1000 단위 반올림 12,000
    expect(jpyToKrwPrice(1234, 950, 1000)).toBe(12000);
  });
});
