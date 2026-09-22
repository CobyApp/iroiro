// 우체국 송장/추적 포맷 — 순수 함수(서버·클라이언트 공용, "server-only" 금지).

// 고객이 웹에서 종적을 확인하는 인터넷우체국 배달조회 페이지.
const EPOST_TRACE_PAGE =
  "https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm";

/**
 * 우체국 등기번호 목업 — 실제 계약 API 연동 전 화면 흐름 확인용.
 * 13자리 국제등기 형식(EB + 9자리 + KR)을 흉내낸다. 같은 시드 = 같은 코드(멱등).
 */
export function mockPostTrackingCode(seed: number): string {
  const digits = String(Math.abs(seed) % 1_000_000_000).padStart(9, "0");
  return `EB${digits}KR`;
}

/** 종적조회 페이지 링크(고객 안내용). 실 QR 도 이 URL 을 담을 수 있다. */
export function trackingPageUrl(trackingCode: string): string {
  return `${EPOST_TRACE_PAGE}?sid1=${encodeURIComponent(trackingCode)}`;
}
