import "server-only";

import { fetchCatalogObject } from "@/lib/r2/catalog";
import { CARD_WM_PREFIX, isCardCleanKey } from "./image-keys";

// /media/catalog-clean/<key> 응답 — 인가는 라우트가 끝냈고, 여기서는 키 검증 + 스트리밍만.
// 관리자 전용이라 공유 캐시 금지(private). 예전 규약(cards/original/…) 키나 clean 이 없는
// 카드는 wm 키로 폴백해 화면이 비지 않게 한다.
const HEADERS = {
  "Cache-Control": "private, max-age=3600",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

const LEGACY_KEY_RE = /^cards\/(original|wm)\/[0-9a-f-]{36}\.jpg$/;

export async function catalogCleanImageResponse(key: string): Promise<Response> {
  if (!isCardCleanKey(key) && !LEGACY_KEY_RE.test(key)) {
    return new Response(null, { status: 404 });
  }
  const candidates = isCardCleanKey(key)
    ? [key, CARD_WM_PREFIX + key.slice("cards/clean/".length)]
    : [key];
  for (const candidate of candidates) {
    try {
      const obj = await fetchCatalogObject(candidate);
      return new Response(obj.body, {
        headers: { ...HEADERS, "Content-Type": obj.contentType },
      });
    } catch {
      // 다음 후보(wm 폴백)로
    }
  }
  return new Response(null, { status: 404 });
}
