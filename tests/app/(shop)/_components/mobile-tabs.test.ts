import { describe, expect, it } from "vitest";
import { TAB_DEFS, isTabActive } from "@/app/(shop)/_components/mobile-tabs";

describe("TAB_DEFS", () => {
  it("둘러보기·중고거래·커뮤니티·마이 4탭을 순서대로 정의한다(중고거래가 2번째, 컬렉션 탭 없음)", () => {
    expect(TAB_DEFS.map((t) => t.key)).toEqual(["discover", "used", "community", "mypage"]);
    expect(TAB_DEFS[1]).toMatchObject({ key: "used", href: "/used" });
    expect(TAB_DEFS.some((t) => t.href.startsWith("/collections"))).toBe(false);
  });
});

describe("isTabActive", () => {
  it("둘러보기는 홈과 상품 카탈로그에서 함께 활성", () => {
    expect(isTabActive("discover", "/")).toBe(true);
    expect(isTabActive("discover", "/products")).toBe(true);
    expect(isTabActive("discover", "/products/117")).toBe(true);
  });
  it("중고거래·커뮤니티·마이페이지는 하위 경로 포함 활성", () => {
    expect(isTabActive("used", "/used")).toBe(true);
    expect(isTabActive("used", "/used/42")).toBe(true);
    expect(isTabActive("community", "/posts")).toBe(true);
    expect(isTabActive("community", "/posts/notice-1")).toBe(true);
    expect(isTabActive("mypage", "/mypage")).toBe(true);
    expect(isTabActive("mypage", "/mypage/edit")).toBe(true);
  });
  it("컬렉션 경로는 어느 탭도 활성화하지 않는다(마이페이지에서 진입)", () => {
    expect(TAB_DEFS.some((t) => isTabActive(t.key, "/collections"))).toBe(false);
  });
});
