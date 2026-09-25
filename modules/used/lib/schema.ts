import { z } from "zod";
import { PRODUCT_CONDITIONS } from "@/modules/products/types";
import {
  USED_ITEM_TYPES,
  USED_REPORT_REASONS,
  USED_REVIEW_REPORT_REASONS,
  USED_SHIPPING_METHODS,
} from "../types";

// 신고·차단·처리 입력 길이 상한(글 신고와 동일 어휘·값).
export const USED_REPORT_DETAIL_MAX = 500;
export const USED_BLOCK_REASON_MAX = 500;
export const USED_RESOLUTION_NOTE_MAX = 1_000;

const positiveId = z.number().int().positive();
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : (v ?? undefined)),
    z.string().max(max).optional(),
  );

// 고객 신고 입력 — 대상 매물 + 사유(+ 상세 선택).
export const usedReportCreateSchema = z.object({
  listingId: positiveId,
  reason: z.enum(USED_REPORT_REASONS),
  detail: optionalText(USED_REPORT_DETAIL_MAX),
});
export type UsedReportCreateInput = z.input<typeof usedReportCreateSchema>;

// 관리자 매물 차단 입력 — 사유 필수(판매자에게 노출).
export const usedBlockSchema = z.object({
  listingId: positiveId,
  reason: z.string().trim().min(1, "차단 사유를 입력해주세요").max(USED_BLOCK_REASON_MAX),
});
export type UsedBlockInput = z.input<typeof usedBlockSchema>;

// 관리자 신고 기각 입력 — 메모 선택.
export const usedDismissReportSchema = z.object({
  reportId: positiveId,
  note: optionalText(USED_RESOLUTION_NOTE_MAX),
});
export type UsedDismissReportInput = z.input<typeof usedDismissReportSchema>;

// 단일 매물 ID 입력(차단 해제 등).
export const usedListingIdSchema = z.object({ listingId: positiveId });
export type UsedListingIdInput = z.input<typeof usedListingIdSchema>;

// 중고 거래 후기 입력 — 거래당 1개, 별점 1~5 + 코멘트(선택).
export const USED_REVIEW_COMMENT_MAX = 500;
export const usedReviewCreateSchema = z.object({
  tradeId: positiveId,
  rating: z.number().int().min(1, "별점을 선택해주세요").max(5),
  comment: optionalText(USED_REVIEW_COMMENT_MAX),
});
export type UsedReviewCreateInput = z.input<typeof usedReviewCreateSchema>;

// 중고 후기 신고·처리 입력(글/매물 신고와 동일 어휘).
export const USED_REVIEW_HIDE_REASON_MAX = 500;
export const usedReviewReportCreateSchema = z.object({
  reviewId: positiveId,
  reason: z.enum(USED_REVIEW_REPORT_REASONS),
  detail: optionalText(USED_REPORT_DETAIL_MAX),
});
export type UsedReviewReportCreateInput = z.input<typeof usedReviewReportCreateSchema>;

export const usedReviewHideSchema = z.object({
  reviewId: positiveId,
  reason: z.string().trim().min(1, "숨김 사유를 입력해주세요").max(USED_REVIEW_HIDE_REASON_MAX),
});
export type UsedReviewHideInput = z.input<typeof usedReviewHideSchema>;

export const usedReviewDismissSchema = z.object({
  reportId: positiveId,
  note: optionalText(USED_RESOLUTION_NOTE_MAX),
});
export type UsedReviewDismissInput = z.input<typeof usedReviewDismissSchema>;

export const usedReviewIdSchema = z.object({ reviewId: positiveId });
export type UsedReviewIdInput = z.input<typeof usedReviewIdSchema>;

export const usedPhotoInputSchema = z.object({
  r2Key: z.string().min(1),
  displayOrder: z.number().int().min(0),
  isPrimary: z.boolean(),
});

// 직거래 만날 장소 — 카카오맵에서 고른 지점. 좌표는 대한민국 대략 범위로 방어(오입력·조작 차단).
export const meetLocationSchema = z.object({
  label: z.string().trim().min(1, "장소 이름을 입력하세요").max(30),
  address: z.string().trim().max(200).default(""),
  lat: z.number().min(33).max(39),
  lng: z.number().min(124).max(132),
});
export type MeetLocationInput = z.input<typeof meetLocationSchema>;

const usedListingBase = z.object({
  // 굿즈 종류. photocard(토레카)만 카탈로그 카드와 연결되고, 나머지는 제목·그룹·멤버를 직접 입력.
  itemType: z.enum(USED_ITEM_TYPES).default("photocard"),
  // 토레카일 때: 선택한 카드에서 제목·그룹·멤버·시리즈를 서버가 파생.
  cardId: z.number().int().positive().nullable().optional(),
  // 토레카가 아닐 때: 제목·그룹·멤버를 직접 입력(시리즈는 선택).
  title: z.string().trim().max(80).nullable().optional().transform((v) => (v === "" ? null : (v ?? null))),
  teamId: z.number().int().positive().nullable().optional(),
  memberId: z.number().int().positive().nullable().optional(),
  seriesId: z.number().int().positive().nullable().optional(),
  // 상태 설명 — 흠집·보관 방법 등 실물 상태 위주.
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : (v ?? null))),
  condition: z.enum(PRODUCT_CONDITIONS),
  saleMode: z.enum(["fixed", "auction"]),
  price: z.number().int().positive().nullable().optional(),
  auctionStartPrice: z.number().int().positive().nullable().optional(),
  auctionEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
  shippingMethod: z.enum(USED_SHIPPING_METHODS).default("post"),
  shippingFee: z.number().int().min(0).max(10000).default(0),
  // 거래 방식(독립 선택) — 최소 하나 true. 직거래면 만날 장소를 최대 3곳 미리 지정(선택).
  parcelEnabled: z.boolean().default(true),
  directEnabled: z.boolean().default(false),
  meetLocations: z.array(meetLocationSchema).max(3, "만날 장소는 최대 3곳").default([]),
  photos: z
    .array(usedPhotoInputSchema)
    .min(1, "사진은 최소 1장")
    .max(8, "사진은 최대 8장")
    .refine(
      (photos) => photos.filter((p) => p.isPrimary).length === 1,
      "대표 사진은 정확히 1장",
    ),
});

// 판매방식별 필수값 — 고정가는 price, 경매는 시작가·마감시각.
// 종류별 필수값 — 토레카는 카드 선택, 그 외는 제목.
export const usedListingCreateSchema = usedListingBase
  // 카드를 골랐으면 카드 기반, 아니면 직접 입력(제목 필수) — 종류 무관.
  .refine(
    (v) => (v.cardId ?? 0) > 0 || !!(v.title && v.title.trim().length > 0),
    { message: "카드를 선택하거나 제목을 입력해주세요", path: ["title"] },
  )
  .refine((v) => v.saleMode !== "fixed" || (v.price ?? 0) > 0, {
    message: "판매가를 입력하세요",
    path: ["price"],
  })
  .refine(
    (v) =>
      v.saleMode !== "auction" ||
      ((v.auctionStartPrice ?? 0) > 0 && !!v.auctionEndsAt),
    { message: "경매 시작가와 마감 시각을 입력하세요", path: ["auctionStartPrice"] },
  )
  // 거래 방식 — 택배·직거래 중 최소 하나는 켜야 한다.
  .refine((v) => v.parcelEnabled || v.directEnabled, {
    message: "택배 또는 직거래 중 하나 이상 선택하세요",
    path: ["parcelEnabled"],
  })
  // 직거래를 끄면 만날 장소는 의미 없음 — 비워야 한다(오염 방지).
  .refine((v) => v.directEnabled || v.meetLocations.length === 0, {
    message: "직거래를 켜야 만날 장소를 넣을 수 있어요",
    path: ["meetLocations"],
  });

export type UsedListingCreateInput = z.input<typeof usedListingCreateSchema>;

export const usedBuySchema = z
  .object({
    listingId: z.number().int().positive(),
    // 거래 방식 — 매물이 허용하는 방식 중 선택. 직거래는 배송지가 없다(대면 수령).
    tradeKind: z.enum(["parcel", "direct"]).default("parcel"),
    // 배송지 — 택배일 때만 필수. 직거래면 생략 가능.
    recipientName: z.string().trim().max(50).optional(),
    recipientPhone: z.string().trim().max(20).optional(),
    recipientAddress: z.string().trim().max(300).optional(),
    // 포인트 사용 — 상품가까지(배송비 제외), 서버가 잔액·한도 재검증.
    usePoints: z.number().int().nonnegative().default(0),
  })
  .refine(
    (v) =>
      v.tradeKind !== "parcel" ||
      (!!v.recipientName &&
        v.recipientName.length >= 1 &&
        !!v.recipientPhone &&
        v.recipientPhone.length >= 9 &&
        !!v.recipientAddress &&
        v.recipientAddress.length >= 5),
    { message: "택배 거래는 수령인·연락처·배송지를 입력하세요", path: ["recipientAddress"] },
  );
export type UsedBuyInput = z.input<typeof usedBuySchema>;

// 묶음 구매 — 같은 판매자의 매물 2개 이상. 수령지·포인트는 단건과 동일.
export const usedBundleBuySchema = z.object({
  listingIds: z
    .array(z.number().int().positive())
    .min(2, "묶음 구매는 2개 이상 선택하세요")
    .max(20, "한 번에 최대 20개")
    .refine((ids) => new Set(ids).size === ids.length, "중복된 매물이 있어요"),
  recipientName: z.string().trim().min(1, "수령인 이름").max(50),
  recipientPhone: z.string().trim().min(9, "연락처").max(20),
  recipientAddress: z.string().trim().min(5, "배송지 주소").max(300),
  usePoints: z.number().int().nonnegative().default(0),
});
export type UsedBundleBuyInput = z.input<typeof usedBundleBuySchema>;
