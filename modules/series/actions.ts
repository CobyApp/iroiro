"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { requireCatalogManager } from "@/modules/admin/lib/requireAdminSpace";
import { CatalogPrisma as Prisma } from "@/lib/catalog-db";

// 시리즈 관리 — 카탈로그 공간에서 관리자가 추가·보정·정리한다.
// label 은 원본 표기(대개 일본어), labelKo 는 한국어 병기(label_i18n.ko).

const seriesInputSchema = z.object({
  sku: z.string().trim().min(1, "SKU를 입력해주세요").max(120),
  label: z.string().trim().min(1, "시리즈 이름을 입력해주세요").max(200),
  labelKo: z.string().trim().max(200).nullable().optional(),
  kind: z.string().trim().min(1, "종류를 입력해주세요").max(50),
  teamId: z.number().int().positive().nullable(),
  // 공식 상품 페이지 URL — 비우면 null. http(s) 만 받는다.
  productUrl: z
    .url({ protocol: /^https?$/, error: "상품 URL 형식을 확인해주세요 (https://…)" })
    .max(500)
    .nullable()
    .optional(),
});

// 추가는 SKU 를 비워도 된다 — 내부 식별용으로 자동 발급(등록 폼의 인라인 추가와 같은 접두어).
const seriesCreateSchema = seriesInputSchema.extend({
  sku: z.string().trim().max(120).optional(),
});

export type SeriesInput = z.infer<typeof seriesInputSchema>;
export type SeriesCreateInput = z.infer<typeof seriesCreateSchema>;

/** 추가 결과 — 등록 폼이 새 시리즈를 바로 선택할 수 있게 저장된 값을 돌려준다. */
export type CreatedSeries = {
  id: number;
  sku: string;
  label: string;
  labelKo: string | null;
  kind: string;
  teamId: number | null;
  productUrl: string | null;
};

function autoSku(): string {
  return `usr-${crypto.randomUUID().slice(0, 8)}`;
}

function revalidateCatalog() {
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/series");
  revalidatePath("/admin/catalog/cards");
}

// 한국어 병기 → label_i18n. 비우면 null(컬럼 NULL).
function labelI18nOf(labelKo: string | null | undefined) {
  return labelKo ? { ko: labelKo } : null;
}

export async function createSeries(
  input: SeriesCreateInput,
): Promise<ActionResult<CreatedSeries>> {
  return runAction(async () => {
    await requireCatalogManager();
    const parsed = seriesCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
        "invalid_input",
      );
    }
    const sku = parsed.data.sku || autoSku();
    const dup = await catalogDb.series.findUnique({
      where: { sku },
    });
    if (dup) throw new DomainError("이미 있는 SKU예요", "duplicate_sku");
    const row = await catalogDb.series.create({
      data: {
        sku,
        label: parsed.data.label,
        labelI18n: labelI18nOf(parsed.data.labelKo) ?? undefined,
        kind: parsed.data.kind,
        teamId:
          parsed.data.teamId === null ? null : BigInt(parsed.data.teamId),
        productUrl: parsed.data.productUrl ?? null,
      },
    });
    revalidateCatalog();
    return {
      id: Number(row.id),
      sku: row.sku,
      label: row.label,
      labelKo: parsed.data.labelKo || null,
      kind: row.kind,
      teamId: row.teamId === null ? null : Number(row.teamId),
      productUrl: row.productUrl,
    };
  });
}

export async function updateSeries(
  id: number,
  input: SeriesInput,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireCatalogManager();
    const parsed = seriesInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
        "invalid_input",
      );
    }
    const dup = await catalogDb.series.findUnique({
      where: { sku: parsed.data.sku },
      select: { id: true },
    });
    if (dup && Number(dup.id) !== id) {
      throw new DomainError("이미 있는 SKU예요", "duplicate_sku");
    }
    await catalogDb.series.update({
      where: { id: BigInt(id) },
      data: {
        sku: parsed.data.sku,
        label: parsed.data.label,
        labelI18n: labelI18nOf(parsed.data.labelKo) ?? Prisma.DbNull,
        kind: parsed.data.kind,
        teamId:
          parsed.data.teamId === null ? null : BigInt(parsed.data.teamId),
        productUrl: parsed.data.productUrl ?? null,
        updatedAt: new Date(),
      },
    });
    revalidateCatalog();
  });
}

// 삭제는 연결된 상품이 없을 때만 — 있으면 먼저 상품에서 시리즈를 바꿔야 한다.
export async function deleteSeries(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireCatalogManager();
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
    await catalogDb.series.delete({ where: { id: BigInt(id) } });
    revalidateCatalog();
  });
}
