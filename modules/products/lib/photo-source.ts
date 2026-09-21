import "server-only";

import { fetchR2Object } from "@/lib/r2/get";
import type { R2Object } from "@/lib/r2/get";
import { productCleanKey } from "./photo-keys";

// 상품 사진 원본 읽기 — clean(워터마크 없음)을 우선하고, 없으면 wm(저장된 r2_key)으로 폴백.
// 소유자 컬렉션 서빙·관리자 다운로드처럼 "워터마크 없는 쪽이 맞는" 경로가 쓴다.
export async function fetchProductPhotoOriginal(r2Key: string): Promise<R2Object> {
  const clean = productCleanKey(r2Key);
  if (clean) {
    try {
      return await fetchR2Object(clean);
    } catch {
      // 예전 사진 — clean 미존재
    }
  }
  return fetchR2Object(r2Key);
}
