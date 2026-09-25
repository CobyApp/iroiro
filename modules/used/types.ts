import {
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_BADGE_CLASS,
  PRODUCT_CONDITION_LABEL,
  type ProductCondition,
} from "@/modules/products/types";

// 중고 매물 도메인 타입 — product(회사 판매)와 별개의 유저 등록 매물.
// 컨디션 어휘는 product와 공유한다(구매자 학습 비용 최소화).
export { PRODUCT_CONDITIONS, PRODUCT_CONDITION_BADGE_CLASS, PRODUCT_CONDITION_LABEL };
export type { ProductCondition };

export const USED_STATUS_LABEL = {
  active: "판매중",
  reserved: "거래중",
  sold: "판매완료",
  canceled: "취소됨",
  blocked: "차단됨",
} as const satisfies Record<string, string>;
export type UsedStatus = keyof typeof USED_STATUS_LABEL;

// 중고 굿즈 종류 — 스토어(토레카 전용)와 달리 중고는 다양한 아이돌 굿즈를 다룬다.
// photocard(토레카)만 카탈로그 카드와 연결되고, 나머지는 그룹·멤버·제목을 직접 입력한다.
// 값 photocard 는 스토어와 동일 어휘(레거시 호환) — used_listing.item_type 에 저장.
export const USED_ITEM_TYPE_LABEL = {
  photocard: "토레카",
  cheki: "체키",
  can_badge: "캔뱃지",
  acrylic_stand: "아크릴 스탠드",
  plush: "인형",
  keyring: "키링",
  strap: "스트랩",
  penlight: "펜라이트",
  poster: "포스터",
  clearfile: "클리어파일",
  apparel: "의류",
  other: "기타",
} as const satisfies Record<string, string>;
export type UsedItemType = keyof typeof USED_ITEM_TYPE_LABEL;
export const USED_ITEM_TYPES = Object.keys(USED_ITEM_TYPE_LABEL) as [
  UsedItemType,
  ...UsedItemType[],
];
// 카탈로그 카드와 연결되는 종류 — 이것만 카드 선택 흐름을 쓴다.
export const USED_CARD_ITEM_TYPE: UsedItemType = "photocard";

export const USED_SHIPPING_LABEL = {
  post: "우체국 준등기",
  parcel: "택배",
} as const satisfies Record<string, string>;
export type UsedShippingMethod = keyof typeof USED_SHIPPING_LABEL;
export const USED_SHIPPING_METHODS = Object.keys(USED_SHIPPING_LABEL) as [
  UsedShippingMethod,
  ...UsedShippingMethod[],
];

export const USED_TRADE_STATUS_LABEL = {
  pending: "결제 대기",
  paid: "결제 완료",
  shipped: "발송됨",
  handed_over: "전달 완료", // 직거래 — 판매자가 대면 전달을 표시
  completed: "거래 완료",
  disputed: "분쟁 접수",
  refunded: "환불됨",
  canceled: "취소됨",
} as const satisfies Record<string, string>;
export type UsedTradeStatus = keyof typeof USED_TRADE_STATUS_LABEL;

// 거래 방식 — 택배(parcel)와 직거래(direct). 매물은 둘을 독립적으로 켤 수 있고, 구매 시 하나로 확정된다.
export const USED_TRADE_KIND_LABEL = {
  parcel: "택배",
  direct: "직거래",
} as const satisfies Record<string, string>;
export type UsedTradeKind = keyof typeof USED_TRADE_KIND_LABEL;
export const USED_TRADE_KINDS = Object.keys(USED_TRADE_KIND_LABEL) as [
  UsedTradeKind,
  ...UsedTradeKind[],
];

// 거래 분쟁 사유 — 발송/전달 후 문제. 단순 변심은 보호 대상이 아니므로 목록에 없다(안내로 구분).
export const USED_DISPUTE_REASON_LABEL = {
  not_received: "받지 못했어요(미도착)",
  damaged: "파손·불량이에요",
  not_as_described: "설명과 달라요(가품 의심 포함)",
  other: "기타 문제",
} as const satisfies Record<string, string>;
export type UsedDisputeReason = keyof typeof USED_DISPUTE_REASON_LABEL;
export const USED_DISPUTE_REASONS = Object.keys(USED_DISPUTE_REASON_LABEL) as [
  UsedDisputeReason,
  ...UsedDisputeReason[],
];

// 직거래 만날 장소 — 카카오맵에서 고른 지점. 매물당 최대 3곳.
export type MeetLocation = {
  label: string; // 예: "서면역 1번 출구"
  address: string; // 도로명/지번 주소(카카오 검색 결과)
  lat: number;
  lng: number;
};
export const MEET_LOCATION_MAX = 3;

export const USED_BUNDLE_STATUS_LABEL = {
  pending: "결제 대기",
  paid: "결제 완료",
  shipped: "발송됨",
  completed: "거래 완료",
  canceled: "취소됨",
} as const satisfies Record<string, string>;
export type UsedBundleStatus = keyof typeof USED_BUNDLE_STATUS_LABEL;

export type UsedBundle = {
  id: number;
  buyerAccountId: string;
  sellerAccountId: string;
  itemTotal: number;
  shippingFee: number;
  pointsUsed: number;
  feeAmount: number;
  sellerPayout: number;
  status: UsedBundleStatus;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  postTrackingCode: string | null;
  courier: string | null;
  shippedAt: string | null;
  createdAt: string;
};

export type UsedSaleMode = "fixed" | "auction";
export type UsedAuctionStatus = "live" | "awarded" | "passed";

export type UsedListingPhoto = {
  id: number;
  listingId: number;
  r2Key: string;
  displayOrder: number;
  isPrimary: boolean;
};

export type UsedListing = {
  id: number;
  sellerAccountId: string;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  seriesId: number | null;
  sourceProductId: number | null;
  title: string;
  description: string | null;
  condition: ProductCondition;
  saleMode: UsedSaleMode;
  price: number | null;
  shippingMethod: UsedShippingMethod;
  shippingFee: number;
  // 거래 방식(독립) — 최소 하나는 true. 직거래면 meetLocations 로 만날 장소를 노출.
  parcelEnabled: boolean;
  directEnabled: boolean;
  meetLocations: MeetLocation[];
  status: UsedStatus;
  auctionStartPrice: number | null;
  auctionCurrentPrice: number | null;
  auctionBidCount: number;
  auctionEndsAt: string | null;
  auctionStatus: UsedAuctionStatus | null;
  auctionWinnerAccountId: string | null;
  auctionPayDueAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

export type UsedListingWithPhotos = UsedListing & {
  photos: UsedListingPhoto[];
  sellerName: string;
  // 이 매물을 찜한 사용자 수 — 리스트 카드 관심도 표시.
  wishCount: number;
  // 이 매물의 공개 댓글 수(삭제 제외) — 리스트 카드 표시.
  commentCount: number;
};

// ── 중고 매물 공개 댓글 ─────────────────────────────────────────────────────
export type UsedComment = {
  id: number;
  listingId: number;
  accountId: string;
  authorName: string;
  parentId: number | null;
  body: string; // 삭제된 댓글은 마스킹된 문구
  deleted: boolean;
  edited: boolean;
  createdAt: string;
};

// 1단계 스레드 — 최상위 댓글 + 대댓글 배열.
export type UsedCommentNode = UsedComment & { replies: UsedComment[] };

export type UsedTrade = {
  id: number;
  listingId: number;
  buyerAccountId: string;
  sellerAccountId: string;
  price: number;
  shippingFee: number;
  feeBp: number;
  feeAmount: number;
  sellerPayout: number;
  status: UsedTradeStatus;
  tradeKind: UsedTradeKind;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  postTrackingCode: string | null;
  courier: string | null;
  postQrIssuedAt: string | null;
  shippedAt: string | null;
  handedOverAt: string | null;
  completedAt: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
  refundedAt: string | null;
  refundAmount: number | null;
  refundReason: string | null;
  createdAt: string;
};

// ── 중고 매물 신고 ────────────────────────────────────────────────────────
// 신고 사유 — 중고거래 성격에 맞춘 어휘(글 신고와 다르다). 순서 = 다이얼로그 표시 순서.
export const USED_REPORT_REASONS = [
  "prohibited",
  "counterfeit",
  "misleading",
  "fraud",
  "spam",
  "abuse",
  "other",
] as const;
export type UsedReportReason = (typeof USED_REPORT_REASONS)[number];
export const USED_REPORT_REASON_LABELS: Record<UsedReportReason, string> = {
  prohibited: "판매 금지 물품",
  counterfeit: "가품/위조품 의심",
  misleading: "허위·과장(상태·설명 불일치)",
  fraud: "사기/외부 거래 유도",
  spam: "스팸/도배",
  abuse: "욕설/비방",
  other: "기타",
};

// 신고 큐에서 본 대상 매물의 현재 상태 — 노출/차단/판매완료/없음.
export type UsedReportTargetStatus = "visible" | "blocked" | "sold" | "missing";

// 신고 시점 매물 스냅샷(증거 동결) — 이후 매물 수정/삭제와 무관하게 보존.
export type UsedReportSnapshot = {
  version: 1;
  title: string;
  description: string | null;
  price: number | null;
  saleMode: UsedSaleMode;
  sellerName: string;
  sellerCode: string;
  primaryPhotoKey: string | null;
  updatedAt: string;
};

// 관리자 신고 큐 항목(미해결) — 대상 매물 요약 + 신고 메타.
export type UsedReportQueueItem = {
  id: number;
  listingId: number;
  reason: UsedReportReason;
  detail: string | null;
  snapshot: UsedReportSnapshot;
  reporterMasked: string;
  createdAt: string;
  targetStatus: UsedReportTargetStatus;
};

// 중고거래 관리 공간의 매물 목록 행 — 사진 1장·판매자·미해결 신고 수를 요약.
export type AdminUsedListingRow = {
  id: number;
  title: string;
  status: UsedStatus;
  saleMode: UsedSaleMode;
  price: number | null;
  sellerAccountId: string;
  sellerName: string;
  primaryPhotoKey: string | null;
  openReports: number;
  blockedReason: string | null;
  createdAt: string;
};

// ── 중고 거래 후기 ────────────────────────────────────────────────────────
export type UsedReview = {
  id: number;
  tradeId: number;
  listingId: number;
  reviewerMasked: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

// 판매자 후기 요약 — 평균 별점·개수.
export type SellerReviewSummary = {
  count: number;
  avg: number;
};

// ── 중고 거래 후기 신고 ────────────────────────────────────────────────────
// 신고 사유 — 리뷰 성격(내용 문제 위주). 스토어 리뷰 신고와 같은 어휘(도메인 결합 회피 위해 독립 정의).
export const USED_REVIEW_REPORT_REASONS = [
  "abuse",
  "false",
  "spam",
  "privacy",
  "other",
] as const;
export type UsedReviewReportReason = (typeof USED_REVIEW_REPORT_REASONS)[number];
export const USED_REVIEW_REPORT_REASON_LABELS: Record<UsedReviewReportReason, string> = {
  abuse: "욕설·비방·혐오 표현",
  false: "허위·사실과 다른 내용",
  spam: "광고·스팸·도배",
  privacy: "개인정보 노출",
  other: "기타",
};

// 신고 큐에서 본 대상 후기의 현재 상태 — 노출/숨김/없음.
export type UsedReviewReportTargetStatus = "visible" | "hidden" | "missing";

// 신고 시점 후기 스냅샷(증거 동결).
export type UsedReviewReportSnapshot = {
  version: 1;
  rating: number;
  comment: string | null;
  listingId: number;
  sellerName: string;
  reviewerName: string;
  createdAt: string;
};

// 관리자 신고 큐 항목(미해결).
export type UsedReviewReportQueueItem = {
  id: number;
  reviewId: number;
  reason: UsedReviewReportReason;
  detail: string | null;
  snapshot: UsedReviewReportSnapshot;
  reporterMasked: string;
  createdAt: string;
  targetStatus: UsedReviewReportTargetStatus;
};
