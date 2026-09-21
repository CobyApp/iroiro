import "server-only";

import { v7 as uuidv7 } from "uuid";
import { putCatalogObject } from "@/lib/r2/catalog";
import { normalizeCardImageVariants } from "./normalize-card-server";
import { cardImageKeysFor } from "./image-keys";

// 카드 앞면 저장 — 정규화(63:88·720px) 후 clean·wm 두 벌을 카탈로그 버킷에 올리고 wm 키를 돌려준다.
// 등록 액션(uploadCardPhoto)과 원오프 재수집 스크립트가 같은 경로를 쓴다.
export async function storeCardFrontImage(
  input: Buffer,
): Promise<{ wmKey: string; cleanKey: string }> {
  const { clean, wm } = await normalizeCardImageVariants(input);
  const keys = cardImageKeysFor(uuidv7());
  await Promise.all([
    putCatalogObject(keys.clean, clean, "image/jpeg"),
    putCatalogObject(keys.wm, wm, "image/jpeg"),
  ]);
  return { wmKey: keys.wm, cleanKey: keys.clean };
}
