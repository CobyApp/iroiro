"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUsedManager } from "@/modules/admin/lib/requireAdminSpace";

const usedTradeSettingSchema = z.object({
  // 만분율(bp): 1000 = 10%. DB CHECK(0~5000)와 동일 범위를 입력단에서도 강제.
  feeBp: z.number().int().min(0).max(5000),
});

// 중고거래 수수료 설정 — upsert로 싱글턴 행을 보장한다.
// 기능 온오프는 제거됐다(상시 활성). used_trade_enabled 컬럼은 더 이상 읽지도 쓰지도 않는다
// (NOT NULL DEFAULT false — db/schema.sql — 이라 create 시 기본값으로 채워진다).
export async function updateUsedTradeSetting(input: { feeBp: number }): Promise<void> {
  await requireUsedManager();
  const data = usedTradeSettingSchema.parse(input);

  await db.siteSetting.upsert({
    where: { id: 1 },
    create: { id: 1, usedTradeFeeBp: data.feeBp },
    update: { usedTradeFeeBp: data.feeBp, updatedAt: new Date() },
  });

  revalidatePath("/market/settings");
  revalidatePath("/used");
}
