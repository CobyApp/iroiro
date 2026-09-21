"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DomainError,
  parseActionInput,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

// 시리즈 종류(kind) 편집 — 카탈로그 공간에서 라벨·순서를 관리한다.
// key 는 series.kind 값이라 만든 뒤에는 바꾸지 않는다(바꾸면 기존 시리즈와 끊어짐).

const keySchema = z
  .string()
  .trim()
  .min(1, "키를 입력해주세요")
  .max(50)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/i, "키는 영문·숫자·공백·_·- 만");

const kindCreateSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1, "라벨을 입력해주세요").max(50),
  displayOrder: z.number().int().positive("순서는 1 이상"),
});

const kindUpdateSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().trim().min(1, "라벨을 입력해주세요").max(50),
  displayOrder: z.number().int().positive("순서는 1 이상"),
});

export type SeriesKindCreateInput = z.infer<typeof kindCreateSchema>;
export type SeriesKindUpdateInput = z.infer<typeof kindUpdateSchema>;

function revalidateKinds() {
  revalidatePath("/catalog/kinds");
  revalidatePath("/catalog/series");
  revalidatePath("/catalog");
}

export async function createSeriesKind(
  input: SeriesKindCreateInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(kindCreateSchema, input);
    try {
      const row = await db.seriesKind.create({
        data: { key: data.key, label: data.label, displayOrder: data.displayOrder },
      });
      revalidateKinds();
      return { id: Number(row.id) };
    } catch (e) {
      if (isUniqueViolationOn(e, "key")) throw new DomainError("이미 있는 키예요", "duplicate_key");
      throw e;
    }
  });
}

export async function updateSeriesKind(
  input: SeriesKindUpdateInput,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(kindUpdateSchema, input);
    await db.seriesKind.update({
      where: { id: BigInt(data.id) },
      data: { label: data.label, displayOrder: data.displayOrder, updatedAt: new Date() },
    });
    revalidateKinds();
  });
}

// 삭제는 그 종류를 쓰는 시리즈가 없을 때만 — 있으면 먼저 시리즈의 종류를 바꿔야 한다.
export async function deleteSeriesKind(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const kind = await db.seriesKind.findUnique({ where: { id: BigInt(id) } });
    if (!kind) throw new DomainError("종류를 찾을 수 없어요", "not_found");
    const used = await db.series.count({ where: { kind: kind.key } });
    if (used > 0) {
      throw new DomainError(
        `이 종류를 쓰는 시리즈가 ${used}개 있어 삭제할 수 없어요`,
        "kind_in_use",
      );
    }
    await db.seriesKind.delete({ where: { id: BigInt(id) } });
    revalidateKinds();
  });
}
