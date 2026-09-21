// 카드 앞면 이미지 키 규약 — 순수 함수(클라이언트·서버 공용, server-only 아님).
// 한 장의 카드 이미지는 카탈로그 버킷에 두 벌로 저장된다:
//   cards/wm/<uuid>.jpg     워터마크(공개)   ← card.front_r2_key 가 가리키는 키
//   cards/clean/<uuid>.jpg  원본(비공개)      ← wm 키에서 파생
// DB 에는 wm 키 하나만 두고 clean 은 규약으로 파생해 스키마·쿼리를 늘리지 않는다.

export const CARD_WM_PREFIX = "cards/wm/";
export const CARD_CLEAN_PREFIX = "cards/clean/";

// wm 키 → clean 키. 규약을 벗어난 키(예전 cards/original/…)면 null — clean 이 없다는 뜻.
export function cardCleanKey(wmKey: string): string | null {
  return wmKey.startsWith(CARD_WM_PREFIX)
    ? CARD_CLEAN_PREFIX + wmKey.slice(CARD_WM_PREFIX.length)
    : null;
}

// clean 키 형식 검증 — 서빙 라우트가 경로 세그먼트를 그대로 버킷 키로 쓰기 전에 거른다.
const CLEAN_KEY_RE = /^cards\/clean\/[0-9a-f-]{36}\.jpg$/;
export function isCardCleanKey(key: string): boolean {
  return CLEAN_KEY_RE.test(key);
}

// 새 카드 이미지 한 벌의 키 쌍. id 는 호출부가 uuidv7 로 만든다(서버).
export function cardImageKeysFor(id: string): { wm: string; clean: string } {
  return { wm: `${CARD_WM_PREFIX}${id}.jpg`, clean: `${CARD_CLEAN_PREFIX}${id}.jpg` };
}
