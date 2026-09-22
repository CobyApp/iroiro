/**
 * 우체국 배송추적 어댑터 타입 — 타입 전용("server-only" 금지, 클라이언트 참조 허용).
 */

// 배송 진행 단계 — 우체국 종적조회의 처리상태를 앱 어휘로 정규화.
export type TrackingState =
  | "unknown"
  | "accepted" // 접수
  | "in_transit" // 배송중(발송/도착/운송)
  | "out_for_delivery" // 배달출발
  | "delivered"; // 배달완료

export const TRACKING_STATE_LABEL: Record<TrackingState, string> = {
  unknown: "조회 대기",
  accepted: "접수",
  in_transit: "배송 중",
  out_for_delivery: "배달 출발",
  delivered: "배달 완료",
};

export type TrackingEvent = {
  /** 처리 시각(표시용 문자열). */
  time: string;
  /** 처리 위치(우체국/집중국 등). */
  location: string;
  /** 처리 상태 설명. */
  description: string;
  state: TrackingState;
};

export type TrackingStatus = {
  trackingCode: string;
  state: TrackingState;
  stateLabel: string;
  events: TrackingEvent[];
  /** true = 실 우체국 API 미연동으로 더미 데이터. UI 가 "(체험판)" 을 붙인다. */
  isMock: boolean;
};

export type IssueTrackingInput = {
  /** 목업 등기번호 생성 시드(거래/묶음 id 파생). */
  seed: number;
  /** 배송 방식(우체국 준등기/등기 등) — 실연동 시 서비스 구분에 사용. */
  shippingMethod?: string;
};
