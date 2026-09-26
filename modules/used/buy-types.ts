import {
  PRODUCT_CONDITION_LABEL,
  type ProductCondition,
} from "@/modules/products/types";

// 중고 "삽니다"(매입 요청) 도메인 타입 — used_listing(팝니다)의 역방향.
// 구매 희망자가 요청을 올리고, 판매자가 오퍼(팔게요)로 응답한다.

export const BUY_REQUEST_STATUS_LABEL = {
  open: "모집중",
  fulfilled: "성사됨",
  closed: "종료됨",
  blocked: "차단됨",
} as const satisfies Record<string, string>;
export type BuyRequestStatus = keyof typeof BUY_REQUEST_STATUS_LABEL;

export const BUY_OFFER_STATUS_LABEL = {
  pending: "대기중",
  accepted: "수락됨",
  declined: "거절됨",
  withdrawn: "철회됨",
} as const satisfies Record<string, string>;
export type BuyOfferStatus = keyof typeof BUY_OFFER_STATUS_LABEL;

// 최소 상태 옵션 — used_listing.condition 어휘 + "상관없음"(null).
export const BUY_MIN_CONDITION_LABEL: Record<ProductCondition, string> =
  PRODUCT_CONDITION_LABEL;

export type UsedBuyRequest = {
  id: number;
  requesterAccountId: string;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  seriesId: number | null;
  sourceProductId: number | null;
  title: string;
  description: string | null;
  minCondition: ProductCondition | null;
  budget: number | null;
  quantity: number;
  status: BuyRequestStatus;
  offerCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

// 목록·상세 카드용 — 요청자 닉네임 + 그룹/멤버 이름(카탈로그 join 대체).
export type UsedBuyRequestWithMeta = UsedBuyRequest & {
  requesterName: string;
  teamName: string | null;
  memberName: string | null;
};

export type UsedBuyOffer = {
  id: number;
  requestId: number;
  sellerAccountId: string;
  listingId: number | null;
  price: number;
  message: string | null;
  status: BuyOfferStatus;
  createdAt: string;
  updatedAt: string;
};

// 요청 상세에서 보여줄 오퍼 — 판매자 닉네임 + 연결 매물 제목/대표사진.
export type UsedBuyOfferWithMeta = UsedBuyOffer & {
  sellerName: string;
  listingTitle: string | null;
  listingPrimaryKey: string | null;
  listingStatus: string | null;
};
