import "server-only";

import { env, isKoreaPostConfigured } from "@/lib/env";
import { mockPostTrackingCode } from "./format";
import {
  TRACKING_STATE_LABEL,
  type IssueTrackingInput,
  type TrackingEvent,
  type TrackingState,
  type TrackingStatus,
} from "./types";

export type {
  TrackingEvent,
  TrackingState,
  TrackingStatus,
  IssueTrackingInput,
} from "./types";
export { TRACKING_STATE_LABEL } from "./types";
export { mockPostTrackingCode, trackingPageUrl } from "./format";

/**
 * 등기/준등기 송장번호 발급. 실 계약 API(계약고객 전용) 연동 전까지는 목업 번호를 쓴다.
 * format.mockPostTrackingCode 로 EB+9자리+KR 국제등기 형식을 흉내낸다.
 */
export function issueTracking(input: IssueTrackingInput): { trackingCode: string } {
  return { trackingCode: mockPostTrackingCode(input.seed) };
}

// 코드에서 결정적으로 파생한 더미 종적 — 매 조회 동일한 결과를 주도록(안정적 UI).
function mockTrackingStatus(trackingCode: string): TrackingStatus {
  const seed = [...trackingCode].reduce((a, c) => a + c.charCodeAt(0), 0);
  // 접수 → 배송중 → 배달출발 → 배달완료 중 하나까지 진행됐다고 가정.
  const progression: TrackingState[] = [
    "accepted",
    "in_transit",
    "out_for_delivery",
    "delivered",
  ];
  const reached = seed % progression.length; // 0..3
  const events: TrackingEvent[] = progression
    .slice(0, reached + 1)
    .map((state, i) => ({
      time: `D+${i}`,
      location: ["접수 우체국", "발송 집중국", "도착 집중국", "배달 우체국"][i] ?? "우체국",
      description: TRACKING_STATE_LABEL[state],
      state,
    }));
  const state = progression[reached];
  return {
    trackingCode,
    state,
    stateLabel: TRACKING_STATE_LABEL[state],
    events,
    isMock: true,
  };
}

/**
 * 배송 종적조회. KOREA_POST_API_KEY 가 있으면 우체국 국내우편 종적조회 오픈 API 를 호출하고,
 * 없으면(또는 호출/파싱 실패 시) 더미 상태를 돌려준다 — 키 없이도 UI 흐름이 동작한다.
 *
 * 실 API shape(공공데이터포털 15035122): GET {BASE}?serviceKey=...&rgist={등기번호}.
 * 응답의 처리상태(처리단계)를 TrackingState 로 매핑한다. 파서는 실 키 확보 후 확정한다.
 */
export async function getTrackingStatus(
  trackingCode: string,
): Promise<TrackingStatus> {
  if (!isKoreaPostConfigured) return mockTrackingStatus(trackingCode);
  try {
    const url = `${env.KOREA_POST_API_BASE}?serviceKey=${encodeURIComponent(
      env.KOREA_POST_API_KEY!,
    )}&rgist=${encodeURIComponent(trackingCode)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return mockTrackingStatus(trackingCode);
    // 실 응답 스키마는 계약 후 확정 — 현재는 shape 만 두고 안전하게 더미로 폴백.
    return mockTrackingStatus(trackingCode);
  } catch {
    return mockTrackingStatus(trackingCode);
  }
}
