// 모바일 하단 탭바의 순수 설정·로직 — React/JSX 비의존(node 테스트 가능).
// 아이콘 매핑은 클라이언트(MobileTabBarClient)에서 key로 처리한다.

export type TabKey = "discover" | "used" | "wishlist" | "community" | "mypage";

export type TabDef = {
  key: TabKey;
  label: string;
  href: string;
};

// 홈의 큐레이션과 상품 카탈로그는 하나의 "둘러보기" 경험으로 묶는다.
// 장바구니·검색은 상단 헤더가 담당하고, 하단은 둘러보기/중고거래/찜/커뮤니티/마이 5탭이다.
// 찜은 엄지로 닿기 쉬운 한가운데 탭에 둔다. 컬렉션은 마이페이지에서 진입한다(탭 아님).
export const TAB_DEFS: TabDef[] = [
  { key: "discover", label: "둘러보기", href: "/" },
  { key: "used", label: "중고거래", href: "/used" },
  { key: "wishlist", label: "찜", href: "/wishlist" },
  { key: "community", label: "커뮤니티", href: "/posts" },
  { key: "mypage", label: "마이", href: "/mypage" },
];

// 현재 경로 기준 활성 판정.
export function isTabActive(key: TabKey, pathname: string): boolean {
  switch (key) {
    case "discover":
      return pathname === "/" || pathname.startsWith("/products");
    case "used":
      return pathname === "/used" || pathname.startsWith("/used/");
    case "wishlist":
      return pathname === "/wishlist" || pathname.startsWith("/wishlist/");
    case "community":
      return pathname === "/posts" || pathname.startsWith("/posts/");
    case "mypage":
      return pathname === "/mypage" || pathname.startsWith("/mypage/");
  }
}
