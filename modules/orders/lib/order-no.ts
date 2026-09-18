import "server-only";

// 주문번호 포맷 — `OSK + base36(경과일,3) + base36(당일 시퀀스,6)` (예: OSK00B000016).
// - 날짜파트: EPOCH_YMD(2026-07-01) 기준 경과일수를 base36 3자리로 인코딩(직접 노출 X, 복원 가능).
//   용량: 36³ = 46,656일(약 127.7년, ~2154년경)까지.
// - 시퀀스파트: 그날의 채번 순번을 base36 6자리로. 용량: 36⁶ ≈ 21.8억/일. 자정(KST)에 1부터 리셋.
// - 유일성은 (날짜 + 당일 시퀀스) 조합으로 성립. 시퀀스 발급(증가)은 order_no_seq 원자적
//   upsert(actions.nextOrderNo)가 담당하고, 이 파일은 순수 포맷/디코드만 맡는다(테스트 용이).
const PREFIX = "OSK";
const EPOCH_YMD = "2026-07-01";
const DATE_WIDTH = 3;
const SEQ_WIDTH = 6;
const MS_PER_DAY = 86_400_000;

function ymdToEpochDay(ymd: string): number {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

const EPOCH_DAY = ymdToEpochDay(EPOCH_YMD);

function toBase36(value: number, width: number): string {
  return value.toString(36).toUpperCase().padStart(width, "0");
}

// 당일 시퀀스 + KST 날짜(yyyy-MM-dd) → 최종 주문번호 문자열.
export function formatOrderNo(seq: number | bigint, kstYmd: string): string {
  const dayOffset = ymdToEpochDay(kstYmd) - EPOCH_DAY;
  return `${PREFIX}${toBase36(dayOffset, DATE_WIDTH)}${toBase36(Number(seq), SEQ_WIDTH)}`;
}

// 주문번호 → { date(yyyy-MM-dd), seq } 역변환 (어드민·디버그용).
export function decodeOrderNo(orderNo: string): { date: string; seq: number } {
  const body = orderNo.slice(PREFIX.length);
  const dayOffset = Number.parseInt(body.slice(0, DATE_WIDTH), 36);
  const seq = Number.parseInt(body.slice(DATE_WIDTH), 36);
  // 날짜파트는 UTC 기준 day-index bijection(ymdToEpochDay의 역): 시간대 변환이 아니라
  // 정수↔달력일 매핑이므로 getUTC*로 인코딩과 대칭 복원한다.
  const d = new Date((EPOCH_DAY + dayOffset) * MS_PER_DAY);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { date, seq };
}
