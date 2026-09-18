"use server";

import { DomainError } from "@/lib/action-result";
import { createProduct } from "@/modules/products/actions";
import type { ProductCreateInput } from "@/modules/products/lib/schema";
import { copyImageToR2 as copyImage } from "./lib/copy-image";
import { fetchExternalCard } from "./lib/cutie-card";
import { loadRefsCache, resolveImportRefs } from "./lib/resolve-refs";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

export type ImportProductInput = Omit<ProductCreateInput, "photos"> & {
  externalId: number;
};

// 외부 카드로 상품 등록 — 앞/뒤 이미지를 R2로 복사한 뒤 createProduct. Server Action.
export async function createProductFromImport(
  input: ImportProductInput,
): Promise<{ id: number }> {
  // 외부 API 호출·R2 복사가 createProduct의 가드보다 먼저 일어나므로 여기서 먼저 막는다.
  await requireAdmin();
  const { externalId, ...fields } = input;
  const card = await fetchExternalCard(externalId);
  if (!card) throw new Error("외부 카드를 찾을 수 없습니다.");

  // 그룹·멤버 미선택(미매칭) 시 카드 정보로 자동 생성해 매핑한다.
  if (fields.teamId == null || fields.memberId == null) {
    const refs = await loadRefsCache();
    const resolved = await resolveImportRefs(card, refs);
    fields.teamId ??= resolved.teamId;
    fields.memberId ??= resolved.memberId;
  }

  const sku = card.item_code || String(externalId);
  const photos: ProductCreateInput["photos"] = [];
  photos.push({
    r2Key: await copyImage(card.image_url, `${sku}-front.jpg`),
    isThumbnail: true,
    displayOrder: 0,
  });
  if (card.back_image_url) {
    photos.push({
      r2Key: await copyImage(card.back_image_url, `${sku}-back.jpg`),
      isThumbnail: false,
      displayOrder: 1,
    });
  }

  const created = await createProduct({
    ...fields,
    sourceId: String(externalId),
    photos,
  });
  // createProduct는 ActionResult 계약 — 도메인 오류 메시지를 그대로 올린다.
  if (!created.ok) throw new DomainError(created.message, created.code);
  return { id: Number(created.data.id) };
}
