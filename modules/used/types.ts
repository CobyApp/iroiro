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
  direct: "직거래",
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
  completed: "거래 완료",
  canceled: "취소됨",
} as const satisfies Record<string, string>;
export type UsedTradeStatus = keyof typeof USED_TRADE_STATUS_LABEL;

export const USED_BUNDLE_STATUS_LABEL = {
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
};

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
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  postTrackingCode: string | null;
  postQrIssuedAt: string | null;
  completedAt: string | null;
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
