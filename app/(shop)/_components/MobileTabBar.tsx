import { MobileTabBarClient } from "./MobileTabBarClient";
import { isUsedTradeEnabled } from "@/modules/site-settings/lib/queries";

// 공개 탐색 탭 — 중고거래 탭은 전역 설정이 켜져 있을 때만 노출한다.
export async function MobileTabBar() {
  const usedTradeEnabled = await isUsedTradeEnabled();
  return <MobileTabBarClient usedTradeEnabled={usedTradeEnabled} />;
}
