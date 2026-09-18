"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

const usedTradeSettingSchema = z.object({
  enabled: z.boolean(),
  // 만분율(bp): 1000 = 10%. DB CHECK(0~5000)와 동일 범위를 입력단에서도 강제.
  feeBp: z.number().int().min(0).max(5000),
});

// 중고거래 온오프·수수료 설정 — upsert로 싱글턴 행을 보장한다.
export async function updateUsedTradeSetting(input: {
  enabled: boolean;
  feeBp: number;
}): Promise<void> {
  await requireAdmin();
  const data = usedTradeSettingSchema.parse(input);

  await db.siteSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      usedTradeEnabled: data.enabled,
      usedTradeFeeBp: data.feeBp,
    },
    update: {
      usedTradeEnabled: data.enabled,
      usedTradeFeeBp: data.feeBp,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/used");
  revalidatePath("/");
}
