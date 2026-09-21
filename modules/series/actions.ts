"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

// 시리즈 관리 — 카탈로그 동기화가 채우는 데이터를 관리자가 보정·추가·정리한다.

const seriesInputSchema = z.object({
  sku: z.string().trim().min(1, "SKU를 입력해주세요").max(120),
  label: z.string().trim().min(1, "시리즈 이름을 입력해주세요").max(200),
  kind: z.string().trim().min(1, "종류를 입력해주세요").max(50),
  teamId: z.number().int().positive().nullable(),
});

export type SeriesInput = z.infer<typeof seriesInputSchema>;

function revalidateCatalog() {
  revalidatePath("/catalog");
}

export async function createSeries(
  input: SeriesInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = seriesInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
        "invalid_input",
      );
    }
    const dup = await db.series.findUnique({
      where: { sku: parsed.data.sku },
    });
    if (dup) throw new DomainError("이미 있는 SKU예요", "duplicate_sku");
    const row = await db.series.create({
      data: {
        sku: parsed.data.sku,
        label: parsed.data.label,
        kind: parsed.data.kind,
        teamId:
          parsed.data.teamId === null ? null : BigInt(parsed.data.teamId),
      },
    });
    revalidateCatalog();
    return { id: Number(row.id) };
  });
}

export async function updateSeries(
  id: number,
  input: SeriesInput,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = seriesInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
        "invalid_input",
      );
    }
    const dup = await db.series.findUnique({
      where: { sku: parsed.data.sku },
      select: { id: true },
    });
    if (dup && Number(dup.id) !== id) {
      throw new DomainError("이미 있는 SKU예요", "duplicate_sku");
    }
    await db.series.update({
      where: { id: BigInt(id) },
      data: {
        sku: parsed.data.sku,
        label: parsed.data.label,
        kind: parsed.data.kind,
        teamId:
          parsed.data.teamId === null ? null : BigInt(parsed.data.teamId),
        updatedAt: new Date(),
      },
    });
    revalidateCatalog();
  });
}

// 삭제는 연결된 상품이 없을 때만 — 있으면 먼저 상품에서 시리즈를 바꿔야 한다.
export async function deleteSeries(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const linked = await db.product.count({
      where: { seriesId: BigInt(id) },
    });
    if (linked > 0) {
      throw new DomainError(
        `연결된 상품이 ${linked}개 있어 삭제할 수 없어요`,
        "series_in_use",
      );
    }
    const linkedUsed = await db.usedListing.count({
      where: { seriesId: BigInt(id) },
    });
    if (linkedUsed > 0) {
      throw new DomainError(
        `연결된 중고 매물이 ${linkedUsed}개 있어 삭제할 수 없어요`,
        "series_in_use",
      );
    }
    await db.series.delete({ where: { id: BigInt(id) } });
    revalidateCatalog();
  });
}
