// 모바일 하단 탭바의 순수 설정·로직 — React/JSX 비의존(node 테스트 가능).
// 아이콘 매핑은 클라이언트(MobileTabBarClient)에서 key로 처리한다.

export type TabKey = "discover" | "used" | "community" | "mypage";

export type TabDef = {
  key: TabKey;
  label: string;
  href: string;
};

// 홈의 큐레이션과 상품 카탈로그는 하나의 "둘러보기" 경험으로 묶는다.
// 장바구니는 상단 헤더가 담당하고, 하단은 둘러보기/중고거래/커뮤니티/마이 4탭이다.
// 컬렉션은 마이페이지에서 진입한다(탭 아님). 중고거래는 상시 기능(전역 온오프 없음).
export const TAB_DEFS: TabDef[] = [
  { key: "discover", label: "둘러보기", href: "/" },
  { key: "used", label: "중고거래", href: "/used" },
  { key: "community", label: "커뮤니티", href: "/posts" },
  { key: "mypage", label: "마이", href: "/mypage" },
];

// 노출 탭 목록 — 현재는 기능 플래그가 없어 정의 그대로다(호출부 계약 유지).
export function visibleTabs(): TabDef[] {
  return TAB_DEFS;
}

// 현재 경로 기준 활성 판정.
export function isTabActive(key: TabKey, pathname: string): boolean {
  switch (key) {
    case "discover":
      return pathname === "/" || pathname.startsWith("/products");
    case "used":
      return pathname === "/used" || pathname.startsWith("/used/");
    case "community":
      return pathname === "/posts" || pathname.startsWith("/posts/");
    case "mypage":
      return pathname === "/mypage" || pathname.startsWith("/mypage/");
  }
}
