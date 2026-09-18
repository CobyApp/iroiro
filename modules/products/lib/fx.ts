import "server-only";

import { env } from "@/lib/env";

// 매입일 환율(JPY→KRW) 조회. Frankfurter(ECB)는 영업일 기준이라
// 주말/공휴일 요청 시 직전 영업일 환율을 돌려주며, 실제 적용된 기준일을 함께 반환한다.

export type ExchangeRateResult = {
  // 폼 컨벤션: 100¥ = rate ₩ (소수 2자리)
  rate: number;
  // 실제 적용된 기준일 (주말/공휴일이면 직전 영업일)
  date: string;
  // 요청한 매입일
  requestedDate: string;
  source: string;
};

// KRW/1JPY → KRW/100JPY, 소수 2자리 반올림 (폼의 "100¥ = ?₩" 입력값).
export function toRate100(krwPerJpy: number): number {
  return Math.round(krwPerJpy * 100 * 100) / 100;
}

// 엔화 금액 → 원화 환산 후 지정 단위(기본 500원)로 반올림. rate100 = 100¥당 원(fetchJpyKrwRate.rate).
// 가격/환율이 유효하지 않으면 0(가격 미정)을 반환한다.
export function jpyToKrwPrice(jpy: number, rate100: number, unit = 500): number {
  if (!(jpy > 0) || !(rate100 > 0)) return 0;
  const krw = (jpy * rate100) / 100;
  return Math.max(unit, Math.round(krw / unit) * unit);
}

// 날짜별 결과를 프로세스 메모리에 캐시 — 같은 매입일 반복 조회 시 외부 호출 생략.
const cache = new Map<string, ExchangeRateResult>();

export async function fetchJpyKrwRate(
  date: string,
): Promise<ExchangeRateResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("YYYY-MM-DD 형식의 날짜가 필요합니다.");
  }
  const cached = cache.get(date);
  if (cached) return cached;

  const url = `${env.FX_API_BASE}/${date}?from=JPY&to=KRW`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`환율 API 오류 (${res.status})`);

  const json = (await res.json()) as {
    date?: string;
    rates?: { KRW?: number };
  };
  const krwPerJpy = json.rates?.KRW;
  if (typeof krwPerJpy !== "number") {
    throw new Error("해당 날짜의 환율 데이터를 찾을 수 없습니다.");
  }

  const result: ExchangeRateResult = {
    rate: toRate100(krwPerJpy),
    date: json.date ?? date,
    requestedDate: date,
    source: "Frankfurter (ECB)",
  };
  cache.set(date, result);
  return result;
}
