import { MobileTabBarClient } from "./MobileTabBarClient";

// 공개 탐색 탭 — 중고거래는 상시 기능이라 서버 설정 조회가 없다.
export function MobileTabBar() {
  return <MobileTabBarClient />;
}
