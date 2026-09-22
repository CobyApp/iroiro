// 리뷰 신고 — 스토어 상품 리뷰(product_review) 대상. 중고 후기 신고와 같은 어휘를 쓰되
// 도메인 결합을 피해 각 모듈에서 독립 정의한다(값은 동일).

// 신고 사유 — 리뷰 성격(내용 문제 위주). 순서 = 다이얼로그 표시 순서.
export const REVIEW_REPORT_REASONS = [
  "abuse",
  "false",
  "spam",
  "privacy",
  "other",
] as const;
export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number];
export const REVIEW_REPORT_REASON_LABELS: Record<ReviewReportReason, string> = {
  abuse: "욕설·비방·혐오 표현",
  false: "허위·사실과 다른 내용",
  spam: "광고·스팸·도배",
  privacy: "개인정보 노출",
  other: "기타",
};

// 신고 큐에서 본 대상 리뷰의 현재 상태 — 노출/숨김/없음.
export type ReviewReportTargetStatus = "visible" | "hidden" | "missing";

// 신고 시점 리뷰 스냅샷(증거 동결) — 이후 리뷰 수정/삭제와 무관하게 보존.
export type ProductReviewReportSnapshot = {
  version: 1;
  rating: number;
  body: string;
  productId: number;
  productName: string;
  reviewerName: string;
  createdAt: string;
};

// 관리자 신고 큐 항목(미해결) — 대상 리뷰 요약 + 신고 메타.
export type ProductReviewReportQueueItem = {
  id: number;
  reviewId: number;
  reason: ReviewReportReason;
  detail: string | null;
  snapshot: ProductReviewReportSnapshot;
  reporterMasked: string;
  createdAt: string;
  targetStatus: ReviewReportTargetStatus;
};
