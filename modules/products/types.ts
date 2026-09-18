/**
 * 아이템 구분 단일 진실 소스.
 *
 * 새 아이템 구분 추가 절차:
 *   1. 아래 ITEM_TYPE_LABEL 에 `code: "한국어 라벨"` 한 줄 추가
 *   2. (선택) DB CHECK 제약을 쓰는 단계로 진화했다면 마이그레이션도 동반
 *
 * ITEM_TYPES (zod·필터 화이트리스트)와 ItemType (TS union)은 자동 도출되므로
 * 별도로 수정할 필요가 없습니다. 라벨 누락은 TS 컴파일 에러로 잡힙니다.
 */
export const ITEM_TYPE_LABEL = {
  photocard: "포토카드",
} as const satisfies Record<string, string>;

export type ItemType = keyof typeof ITEM_TYPE_LABEL;

export const ITEM_TYPES = Object.keys(ITEM_TYPE_LABEL) as [
  ItemType,
  ...ItemType[],
];

/**
 * 판매 상태 단일 진실 소스.
 *
 * 새 상태 추가 절차:
 *   1. 아래 SALE_STATUS_LABEL 에 `code: "한국어 라벨"` 한 줄 추가
 *   2. (선택) DB CHECK 제약을 도입한 단계라면 마이그레이션도 동반
 *
 * SALE_STATUSES (zod whitelist)와 SaleStatus (TS union)은 자동 도출되므로
 * 별도로 수정할 필요가 없습니다. 라벨 누락은 TS 컴파일 에러로 잡힙니다.
 *
 * 라이프사이클 의미:
 *   - draft : 작성 중 — 공개 페이지에 노출 X
 *   - active : 판매 중 — 공개 페이지 노출 (재고 0이면 노출 정책에 따름)
 *   - archived : 판매 종료 — 기록 보존, 공개 페이지 노출 X
 */
export const SALE_STATUS_LABEL = {
  draft: "임시저장",
  active: "판매중",
  archived: "보관",
} as const satisfies Record<string, string>;

export type SaleStatus = keyof typeof SALE_STATUS_LABEL;

export const SALE_STATUSES = Object.keys(SALE_STATUS_LABEL) as [
  SaleStatus,
  ...SaleStatus[],
];

/**
 * 판매 방식 — fixed(고정가) | auction(입찰 경매, 메루카리식).
 * 경매 상품은 재고 1개 고정, 낙찰 시 salePrice가 낙찰가로 갱신된다.
 */
export const SALE_MODE_LABEL = {
  fixed: "고정가",
  auction: "입찰 경매",
} as const satisfies Record<string, string>;

export type SaleMode = keyof typeof SALE_MODE_LABEL;

export const SALE_MODES = Object.keys(SALE_MODE_LABEL) as [
  SaleMode,
  ...SaleMode[],
];

/** 경매 진행 상태 — sale_mode='auction'일 때만 존재. */
export const AUCTION_STATUS_LABEL = {
  live: "경매 진행중",
  awarded: "낙찰 · 결제 대기",
  passed: "유찰",
} as const satisfies Record<string, string>;

export type AuctionStatus = keyof typeof AUCTION_STATUS_LABEL;

/**
 * 상품 컨디션 단일 진실 소스 (Mercari 5단계 컨벤션 기반).
 *
 * 새 컨디션 추가 절차:
 *   1. 아래 PRODUCT_CONDITION_LABEL 에 `code: "한국어 라벨"` 한 줄 추가
 *   2. (선택) DB CHECK 제약을 도입한 단계라면 마이그레이션도 동반
 *
 * 새상품→상태 나쁨 순으로 정렬되어 있으며 셀렉트에 그대로 노출됩니다.
 * 컨디션이 의미 없는 상품은 null 허용 (스키마 nullable.optional 유지).
 */
export const PRODUCT_CONDITION_LABEL = {
  new: "새상품",
  like_new: "거의 새것",
  good: "양호",
  fair: "사용감 있음",
  poor: "상태 나쁨",
} as const satisfies Record<string, string>;

export type ProductCondition = keyof typeof PRODUCT_CONDITION_LABEL;

export const PRODUCT_CONDITIONS = Object.keys(PRODUCT_CONDITION_LABEL) as [
  ProductCondition,
  ...ProductCondition[],
];

/**
 * 컨디션 시각 색상 — 신호등 + Premium blue 그라데이션.
 * new(파랑) → like_new(에메랄드) → good(앰버) → fair(오렌지) → poor(빨강).
 * Badge `outline` variant 위에 덮어쓰는 형태로 사용.
 */
export const PRODUCT_CONDITION_BADGE_CLASS: Record<ProductCondition, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-300",
  like_new: "bg-emerald-50 text-emerald-700 border-emerald-300",
  good: "bg-amber-50 text-amber-700 border-amber-300",
  fair: "bg-orange-50 text-orange-700 border-orange-300",
  poor: "bg-red-50 text-red-700 border-red-300",
};

export type Product = {
  id: number;
  itemCode: string | null;
  sourceId: string | null;
  itemType: ItemType;
  teamId: number | null;
  memberId: number | null;
  name: string;
  description: string | null;
  purchasePriceJpy: number;
  purchaseExchangeRate: number;
  purchasePriceKrw: number;
  packagingCostKrw: number;
  overseasShippingKrw: number;
  domesticShippingKrw: number;
  otherCostKrw: number;
  purchaser: string | null;
  purchaseDate: string;
  regularPrice: number;
  /**
   * 실판매가 (KRW). DB CHECK 제약으로 항상 `salePrice <= regularPrice`.
   * 할인이 없으면 regularPrice와 동일하게 저장된다 — 표시 측 분기는
   * `salePrice < regularPrice` 로 판단.
   */
  salePrice: number;
  condition: ProductCondition | null;
  stockQuantity: number;
  saleStatus: SaleStatus;
  // ── 카탈로그 계층·외부 시세 (임포트 스냅샷) ──
  seriesId: number | null;
  marketAvgJpy: number;
  marketMinJpy: number;
  marketMaxJpy: number;
  marketSoldCount: number;
  retailPriceJpy: number;
  // ── 입찰 경매 (saleMode='auction'일 때만 의미) ──
  saleMode: SaleMode;
  auctionStartPrice: number | null;
  /** 현재 최고 입찰가 — 입찰 없으면 null */
  auctionCurrentPrice: number | null;
  auctionBidCount: number;
  /** 마감 시각 ISO — 스나이핑 방지 연장으로 갱신될 수 있음 */
  auctionEndsAt: string | null;
  auctionStatus: AuctionStatus | null;
  auctionWinnerAccountId: string | null;
  /** 낙찰자 결제 기한 ISO */
  auctionPayDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductPhoto = {
  id: number;
  productId: number;
  r2Key: string;
  altText: string | null;
  displayOrder: number;
  isThumbnail: boolean;
  createdAt: string;
};

export type ProductWithPhotos = Product & { photos: ProductPhoto[] };
