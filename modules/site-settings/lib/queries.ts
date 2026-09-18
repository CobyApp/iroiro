import "server-only";

import { db } from "@/lib/db";

export type SiteSettings = {
  // 중고거래 판매 수수료, 만분율(bp): 1000 = 10%.
  usedTradeFeeBp: number;
};

const DEFAULTS: SiteSettings = { usedTradeFeeBp: 1000 };

// 전역 설정 싱글턴(id=1) — 행이 없으면 안전한 기본값(수수료 10%).
// 중고거래는 상시 기능이다(2026-09-18 온오프 제거). DB의 used_trade_enabled 컬럼은 더 이상 읽지 않는다.
export async function getSiteSettings(): Promise<SiteSettings> {
  const row = await db.siteSetting.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULTS;
  return { usedTradeFeeBp: row.usedTradeFeeBp };
}
