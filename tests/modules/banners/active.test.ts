import { describe, expect, it } from "vitest";
import { isBannerActiveAt } from "@/modules/banners/lib/active";

const now = new Date("2026-07-22T00:00:00Z");

describe("isBannerActiveAt", () => {
  it("시작·종료 모두 null이면 항상 활성", () => {
    expect(isBannerActiveAt(null, null, now)).toBe(true);
  });
  it("시작이 미래면 비활성", () => {
    expect(isBannerActiveAt(new Date("2026-07-23T00:00:00Z"), null, now)).toBe(
      false,
    );
  });
  it("종료가 과거면 비활성", () => {
    expect(isBannerActiveAt(null, new Date("2026-07-21T00:00:00Z"), now)).toBe(
      false,
    );
  });
  it("기간 내면 활성", () => {
    expect(
      isBannerActiveAt(
        new Date("2026-07-01T00:00:00Z"),
        new Date("2026-07-31T00:00:00Z"),
        now,
      ),
    ).toBe(true);
  });
});
