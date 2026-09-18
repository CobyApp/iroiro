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
