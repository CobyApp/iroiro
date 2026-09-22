import { SERIES_KIND_LABEL, SERIES_KIND_OPTIONS } from "../kinds";

// 시리즈 종류 — 클라이언트에서도 쓸 수 있는 순수 헬퍼. 정본은 DB(series_kind, kinds-queries.ts 로 조회)이고,
// 코드 상수(kinds.ts)는 시드·폴백일 뿐이다. 서버 페이지가 listSeriesKinds() 결과를 폼에 prop 으로
// 내려주고, 폼은 여기 헬퍼로 라벨·정렬·선택지를 만든다 — 관리자가 /catalog/kinds 에서 바꾼 값이 그대로 반영된다.

/** DB series_kind 한 행에서 폼이 필요로 하는 부분(id 는 클라이언트에 필요 없다). */
export type KindOption = { key: string; label: string; displayOrder: number };

// key → 라벨 맵. DB 라벨 우선, 없으면 코드 상수, 그것도 없으면 키 그대로.
export function buildKindLabelMap(kinds: KindOption[]): Record<string, string> {
  const out: Record<string, string> = { ...SERIES_KIND_LABEL };
  for (const k of kinds) out[k.key] = k.label;
  return out;
}

export function kindLabelOf(kinds: KindOption[], key: string): string {
  return kinds.find((k) => k.key === key)?.label ?? SERIES_KIND_LABEL[key] ?? key;
}

// DB 순서대로 키 정렬 — 목록에 없는 키는 뒤에(알파벳), others/unknown 은 DB 순서와 무관하게 맨 뒤.
export function sortKindKeys(keys: string[], kinds: KindOption[]): string[] {
  const rank = new Map(kinds.map((k) => [k.key, k.displayOrder]));
  const rankOf = (key: string) =>
    key === "others" || key === "unknown" ? 1_000_000 : (rank.get(key) ?? 999_999);
  return [...keys].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
}

// "새 시리즈" 종류 선택지 — DB 목록 그대로. 테이블이 비어 있으면(시드 전 환경) 코드 상수로 폴백.
export function kindSelectOptions(kinds: KindOption[]): { key: string; label: string }[] {
  if (kinds.length === 0) {
    return SERIES_KIND_OPTIONS.map((o) => ({ key: o.value, label: o.label }));
  }
  return kinds.map((k) => ({ key: k.key, label: k.label }));
}

// 시리즈 라벨 자연 정렬 — ver.1·ver.2·…·ver.10·ver.15 처럼 숫자를 사전순이 아닌 값 순으로.
// localeCompare 의 numeric 옵션이 "ver.10" 이 "ver.2" 뒤에 오도록 처리한다.
export function compareSeriesLabel(a: string, b: string): number {
  return a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" });
}
