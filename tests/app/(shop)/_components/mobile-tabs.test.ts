import { describe, expect, it } from "vitest";
import {
  TAB_DEFS,
  isTabActive,
} from "@/app/(shop)/_components/mobile-tabs";

describe("TAB_DEFS", () => {
  it("둘러보기·중고거래·컬렉션·커뮤니티·마이 5탭을 순서대로 정의한다", () => {
    expect(TAB_DEFS.map((t) => t.key)).toEqual([
      "discover",
      "used",
      "collection",
      "community",
      "mypage",
    ]);
  });
});

describe("isTabActive", () => {
  it("둘러보기는 홈과 상품 카탈로그에서 함께 활성", () => {
    expect(isTabActive("discover", "/")).toBe(true);
    expect(isTabActive("discover", "/products")).toBe(true);
    expect(isTabActive("discover", "/products/117")).toBe(true);
  });
  it("컬렉션·커뮤니티·마이페이지는 하위 경로 포함 활성", () => {
    expect(isTabActive("collection", "/collections")).toBe(true);
    expect(isTabActive("collection", "/collections/abc123")).toBe(true);
    expect(isTabActive("community", "/posts")).toBe(true);
    expect(isTabActive("community", "/posts/notice-1")).toBe(true);
    expect(isTabActive("mypage", "/mypage")).toBe(true);
    expect(isTabActive("mypage", "/mypage/edit")).toBe(true);
  });
});

describe("visibleTabs", () => {
  it("중고거래 OFF면 used 탭이 목록에서 빠진다", async () => {
    const { visibleTabs } = await import(
      "@/app/(shop)/_components/mobile-tabs"
    );
    expect(
      visibleTabs({ usedTradeEnabled: false }).map((t) => t.key),
    ).toEqual(["discover", "collection", "community", "mypage"]);
    expect(
      visibleTabs({ usedTradeEnabled: true }).map((t) => t.key),
    ).toContain("used");
  });
});
