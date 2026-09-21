// 상품 사진 키 규약 — 순수 함수. 한 장의 상품 사진은 상품 버킷에 두 벌로 저장된다:
//   products/original/<uuid>.jpg  워터마크(공개)  ← product_photo.r2_key
//   products/clean/<uuid>.jpg     원본(비공개)    ← r2_key 에서 파생. 소유자 컬렉션·관리자 다운로드용
// 버킷 정책은 products/clean/ 을 공개하지 않는다(infra/aws/setup.sh).

export const PRODUCT_WM_PREFIX = "products/original/";
export const PRODUCT_CLEAN_PREFIX = "products/clean/";

// wm 키 → clean 키. 규약 밖의 키면 null(예전 사진 — clean 없음).
export function productCleanKey(r2Key: string): string | null {
  return r2Key.startsWith(PRODUCT_WM_PREFIX)
    ? PRODUCT_CLEAN_PREFIX + r2Key.slice(PRODUCT_WM_PREFIX.length)
    : null;
}
