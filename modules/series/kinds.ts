// 시리즈 종류 — 코드 상수는 **시드·폴백**일 뿐이다. 라벨·순서의 정본은 DB(series_kind,
// /catalog/kinds 에서 편집)이며 modules/series/lib/kinds-queries.ts 로 읽고, 폼은
// lib/kind-options.ts 헬퍼로 DB 목록을 렌더한다. 여기 값은 (1) 테이블에 없는 키의 라벨 폴백,
// (2) 테이블이 비어 있는 환경의 선택지 폴백으로만 쓰인다 — 새 종류를 코드에 추가하지 말고 DB 에 넣는다.
// 토레카분석기(core/kinds.py 시드 + 커스텀)와 같은 키·라벨을 쓴다. 분석기 커스텀 종류는 키에 공백이 있어도(예: "CD benefits") 그대로
// 저장한다 — 동기화가 키를 그대로 보내므로 여기서 바꾸면 매칭이 깨진다.
// "기타(others/unknown)"는 항상 목록 맨 아래.

export const SERIES_KIND_LABEL: Record<string, string> = {
  random: "정규",
  costume: "의상",
  event: "이벤트",
  birthday: "생탄제",
  season: "시즌",
  "CD benefits": "CD 특전",
  kuji: "쿠지",
  "sukisuki web": "웹 토레카",
  others: "기타",
  unknown: "기타",
};

export function seriesKindLabel(kind: string): string {
  return SERIES_KIND_LABEL[kind] ?? kind;
}

// 표시 순서 — 분석기 시드 order 그대로(정규→의상→이벤트→생탄제→시즌→CD→쿠지→웹), 기타는 맨 뒤.
const KIND_ORDER = [
  "random",
  "costume",
  "event",
  "birthday",
  "season",
  "CD benefits",
  "kuji",
  "sukisuki web",
];

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
  { value: "CD benefits", label: "CD 특전" },
  { value: "kuji", label: "쿠지" },
  { value: "sukisuki web", label: "웹 토레카" },
  { value: "others", label: "기타" },
] as const;
