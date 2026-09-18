"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

const usedTradeSettingSchema = z.object({
  // 만분율(bp): 1000 = 10%. DB CHECK(0~5000)와 동일 범위를 입력단에서도 강제.
  feeBp: z.number().int().min(0).max(5000),
});

// 중고거래 수수료 설정 — upsert로 싱글턴 행을 보장한다.
// 기능 온오프는 제거됐다(상시 활성). 남아 있는 used_trade_enabled 컬럼은 항상 true로 맞춘다.
export async function updateUsedTradeSetting(input: { feeBp: number }): Promise<void> {
  await requireAdmin();
  const data = usedTradeSettingSchema.parse(input);

  await db.siteSetting.upsert({
    where: { id: 1 },
    create: { id: 1, usedTradeEnabled: true, usedTradeFeeBp: data.feeBp },
    update: { usedTradeEnabled: true, usedTradeFeeBp: data.feeBp, updatedAt: new Date() },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/used");
}
