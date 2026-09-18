import "server-only";

import { db } from "@/lib/db";

export type SiteSettings = {
  usedTradeEnabled: boolean;
  usedTradeFeeBp: number;
};

const DEFAULTS: SiteSettings = { usedTradeEnabled: false, usedTradeFeeBp: 1000 };

// 전역 설정 싱글턴(id=1) — 행이 없으면 안전한 기본값(중고 OFF·수수료 10%).
export async function getSiteSettings(): Promise<SiteSettings> {
  const row = await db.siteSetting.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULTS;
  return {
    usedTradeEnabled: row.usedTradeEnabled,
    usedTradeFeeBp: row.usedTradeFeeBp,
  };
}

// 고객 화면 가드 — 중고거래 노출 여부만 필요할 때.
export async function isUsedTradeEnabled(): Promise<boolean> {
  return (await getSiteSettings()).usedTradeEnabled;
}
