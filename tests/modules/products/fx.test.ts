import { describe, expect, it } from "vitest";
import { toRate100 } from "@/modules/products/lib/fx";

// KRW/1JPY → 폼 컨벤션(100¥ = ?₩) 변환. 소수 2자리 반올림.
describe("toRate100", () => {
  it("1엔당 9.25원 → 100엔당 925원", () => {
    expect(toRate100(9.25)).toBe(925);
  });

  it("소수 2자리까지 유지한다", () => {
    expect(toRate100(9.2534)).toBe(925.34);
  });

  it("2자리 초과는 반올림한다", () => {
    // 9.256789 * 100 * 100 = 92567.89 → round → 92568 → /100 = 925.68
    expect(toRate100(9.256789)).toBe(925.68);
  });

  it("정수 환율도 처리한다", () => {
    expect(toRate100(10)).toBe(1000);
  });
});
