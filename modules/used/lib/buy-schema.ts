import { z } from "zod";
import { PRODUCT_CONDITIONS } from "@/modules/products/types";
import { USED_ITEM_TYPES } from "../types";

// 삽니다(매입 요청)·오퍼 입력 검증 — 매물 등록 스키마(schema.ts)와 같은 어휘를 쓴다.

export const BUY_REQUEST_TITLE_MAX = 80;
export const BUY_REQUEST_DESC_MAX = 2000;
export const BUY_OFFER_MESSAGE_MAX = 1000;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : (v ?? null)));

// 삽니다 등록 — 제목 필수. 그룹·멤버·시리즈·예산·최소상태는 선택.
export const usedBuyRequestCreateSchema = z.object({
  itemType: z.enum(USED_ITEM_TYPES).default("photocard"),
  teamId: z.number().int().positive().nullable().optional(),
  memberId: z.number().int().positive().nullable().optional(),
  seriesId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1, "제목을 입력해주세요").max(BUY_REQUEST_TITLE_MAX),
  description: optionalTrimmed(BUY_REQUEST_DESC_MAX),
  // 최소 허용 상태 — null 이면 상관없음.
  minCondition: z.enum(PRODUCT_CONDITIONS).nullable().optional(),
  // 예산(개당) — null/미입력이면 협의.
  budget: z.number().int().positive().max(100_000_000).nullable().optional(),
  quantity: z.number().int().positive().max(999).default(1),
});
export type UsedBuyRequestCreateInput = z.input<typeof usedBuyRequestCreateSchema>;

// 오퍼(팔게요) — 가격 필수. 메시지·연결 매물은 선택.
export const usedBuyOfferCreateSchema = z.object({
  requestId: z.number().int().positive(),
  price: z.number().int().positive("가격을 입력해주세요").max(100_000_000),
  message: optionalTrimmed(BUY_OFFER_MESSAGE_MAX),
  listingId: z.number().int().positive().nullable().optional(),
});
export type UsedBuyOfferCreateInput = z.input<typeof usedBuyOfferCreateSchema>;

// 오퍼 단건 동작(수락·거절·철회).
export const usedBuyOfferIdSchema = z.object({
  offerId: z.number().int().positive(),
});
export type UsedBuyOfferIdInput = z.input<typeof usedBuyOfferIdSchema>;

// 요청 단건 동작(종료).
export const usedBuyRequestIdSchema = z.object({
  requestId: z.number().int().positive(),
});
export type UsedBuyRequestIdInput = z.input<typeof usedBuyRequestIdSchema>;
