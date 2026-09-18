/**
 * KST(Asia/Seoul) 변환 단일 진실 소스.
 *
 * 모든 사용자 노출 날짜·시간 표시는 이 파일의 헬퍼만 거쳐야 한다. ESLint
 * `no-restricted-syntax` 가드가 `Intl.DateTimeFormat` 직접 사용 /
 * `toLocaleDateString` / `toLocaleTimeString` / `toISOString().slice(...)` 를
 * 이 파일 바깥에서 차단하므로, 새 표시 지점이 추가될 때 자동으로 이 파일을
 * 거치도록 강제된다.
 *
 * 내부 비교·정렬(서버 쿼리, `Date#getTime()` 산술 등)에는 UTC를 그대로 쓰고,
 * 표시 직전에만 변환한다.
 */

const KST_TIME_ZONE = "Asia/Seoul";

// "en-CA" 로케일은 자연스럽게 ISO YYYY-MM-DD 포맷을 출력한다 — 별도 padding 불요.
const YMD_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const YMD_HM_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

/** "2026-05-17" — Asia/Seoul 기준 날짜만. */
export function formatKstDate(input: string | Date): string {
  return YMD_FORMATTER.format(toDate(input));
}

/** "2026-05-17 14:30" — Asia/Seoul 기준 분 단위. */
export function formatKstDateTime(input: string | Date): string {
  // en-CA는 "2026-05-17, 14:30" 으로 콤마를 끼움 — 공백으로 정규화.
  return YMD_HM_FORMATTER.format(toDate(input)).replace(", ", " ");
}

/**
 * "방금" / "N분 전" / "N시간 전" / "N일 전" / 7일 초과는 KST 날짜.
 * UTC 밀리초 차이로 계산하므로 timezone 영향 없음. 7일 fallback만 KST.
 */
export function formatKstRelative(input: string | Date): string {
  const target = toDate(input);
  const diffMs = Date.now() - target.getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatKstDate(target);
}

/** 폼 default 등에서 사용할 "오늘"의 KST YYYY-MM-DD. */
export function todayKstYmd(): string {
  return formatKstDate(new Date());
}

// 이벤트 D-day — KST 날짜 기준. 종료일(없으면 시작일)까지 지나면 ended.
// 시작 전이면 D-n(오늘=D-DAY), 시작~종료 사이는 진행 중.
export type DdayInfo = { label: string; state: "upcoming" | "ongoing" | "ended" };

export function formatDday(
  startsAt: string | Date,
  endsAt: string | Date | null = null,
): DdayInfo {
  const today = formatKstDate(new Date());
  const startDay = formatKstDate(startsAt);
  const endDay = formatKstDate(endsAt ?? startsAt);
  if (today > endDay) return { label: "종료", state: "ended" };
  if (today >= startDay) return { label: "진행 중", state: "ongoing" };
  // 남은 일수 — KST 자정 경계 기준(YMD 파싱해 UTC 자정 차이로 계산).
  const [ty, tm, td] = today.split("-").map(Number);
  const [sy, sm, sd] = startDay.split("-").map(Number);
  const dayMs = 86_400_000;
  const diff = Math.round(
    (Date.UTC(sy, sm - 1, sd) - Date.UTC(ty, tm - 1, td)) / dayMs,
  );
  return { label: `D-${diff}`, state: "upcoming" };
}
