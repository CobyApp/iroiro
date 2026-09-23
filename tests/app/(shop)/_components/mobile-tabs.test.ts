import { describe, expect, it } from "vitest";
import { TAB_DEFS, isTabActive } from "@/app/(shop)/_components/mobile-tabs";

describe("TAB_DEFS", () => {
  it("둘러보기·중고거래·커뮤니티·마이 4탭 — 찜은 상단 헤더 아이콘으로 이동", () => {
    expect(TAB_DEFS.map((t) => t.key)).toEqual([
      "discover",
      "used",
      "community",
      "mypage",
    ]);
    expect(TAB_DEFS.some((t) => t.href === "/wishlist")).toBe(false);
    expect(TAB_DEFS.some((t) => t.href.startsWith("/collections"))).toBe(false);
  });
});

describe("isTabActive", () => {
  it("각 탭은 자기 경로와 하위 경로에서 활성", () => {
    expect(isTabActive("discover", "/")).toBe(true);
    expect(isTabActive("discover", "/products/1")).toBe(true);
    expect(isTabActive("used", "/used/42")).toBe(true);
    expect(isTabActive("community", "/posts/x")).toBe(true);
    expect(isTabActive("mypage", "/mypage/edit")).toBe(true);
  });

  it("다른 탭 경로에서는 비활성", () => {
    expect(isTabActive("used", "/posts")).toBe(false);
    expect(isTabActive("discover", "/posts")).toBe(false);
  });
});
