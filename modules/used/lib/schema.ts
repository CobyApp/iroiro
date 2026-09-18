import { z } from "zod";
import { PRODUCT_CONDITIONS } from "@/modules/products/types";
import { USED_SHIPPING_METHODS } from "../types";

export const usedPhotoInputSchema = z.object({
  r2Key: z.string().min(1),
  displayOrder: z.number().int().min(0),
  isPrimary: z.boolean(),
});

const usedListingBase = z.object({
  // 제목·그룹·멤버·시리즈는 선택한 토레카(card)에서 서버가 파생한다.
  cardId: z.number().int().positive({ message: "카드를 선택해주세요" }),
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
export const usedListingCreateSchema = usedListingBase
  .refine((v) => v.saleMode !== "fixed" || (v.price ?? 0) > 0, {
    message: "판매가를 입력하세요",
    path: ["price"],
  })
  .refine(
    (v) =>
      v.saleMode !== "auction" ||
      ((v.auctionStartPrice ?? 0) > 0 && !!v.auctionEndsAt),
    { message: "경매 시작가와 마감 시각을 입력하세요", path: ["auctionStartPrice"] },
  );

export type UsedListingCreateInput = z.input<typeof usedListingCreateSchema>;

export const usedBuySchema = z.object({
  listingId: z.number().int().positive(),
  recipientName: z.string().trim().min(1, "수령인 이름").max(50),
  recipientPhone: z.string().trim().min(9, "연락처").max(20),
  recipientAddress: z.string().trim().min(5, "배송지 주소").max(300),
  // 포인트 사용 — 상품가까지(배송비 제외), 서버가 잔액·한도 재검증.
  usePoints: z.number().int().nonnegative().default(0),
});
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
