// 시리즈 종류 — 라벨·정렬의 단일 소스. 토레카분석기(core/kinds.py) 시드와
// 동일한 라벨: random=정규, costume=의상, event=이벤트, birthday=생탄제.
// "기타(others/unknown)"는 항상 목록 맨 아래.

export const SERIES_KIND_LABEL: Record<string, string> = {
  random: "정규",
  costume: "의상",
  event: "이벤트",
  birthday: "생탄제",
  season: "시즌",
  others: "기타",
  unknown: "기타",
};

export function seriesKindLabel(kind: string): string {
  return SERIES_KIND_LABEL[kind] ?? kind;
}

// 표시 순서 — 분석기 시드 order 그대로, 기타는 맨 뒤.
const KIND_ORDER = ["random", "costume", "event", "birthday", "season"];

export function sortSeriesKinds(kinds: string[]): string[] {
  return [...kinds].sort((a, b) => {
    const rank = (k: string) => {
      const i = KIND_ORDER.indexOf(k);
      if (i !== -1) return i;
      return k === "others" || k === "unknown"
        ? KIND_ORDER.length + 1
        : KIND_ORDER.length;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}

// 생성 폼 선택지 — 기타는 others로 저장(외부 동기화와 동일 값).
export const SERIES_KIND_OPTIONS = [
  { value: "random", label: "정규" },
  { value: "costume", label: "의상" },
  { value: "event", label: "이벤트" },
  { value: "birthday", label: "생탄제" },
  { value: "season", label: "시즌" },
  { value: "others", label: "기타" },
] as const;
