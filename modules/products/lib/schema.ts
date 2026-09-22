import { z } from "zod";
import { ITEM_TYPES, SALE_MODES, SALE_STATUSES } from "../types";

export const productPhotoInputSchema = z.object({
  r2Key: z.string().min(1),
  altText: z.string().nullable().optional(),
  displayOrder: z.number().int().min(0),
  isThumbnail: z.boolean(),
});

// refine을 거치지 않은 base object — `.partial()` 사용을 위해 분리.
// (zod 4: refined object에는 `.partial()` 사용 불가)
const productInputBase = z.object({
  // 외부 식별 코드 (예: 토레카 시리얼). 비워서 NULL로 보내거나 임의 문자열 허용.
  itemCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
  itemType: z.enum(ITEM_TYPES),
  teamId: z.number().int().positive().nullable().optional(),
  memberId: z.number().int().positive().nullable().optional(),
  // 등록 출처 카탈로그 카드 id — 일괄 등록의 "미등록만 보기" 판별 키. 수기 등록은 비움(NULL).
  catalogCardId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1, "상품명 필수").max(200),
  regularPrice: z.number().int().nonnegative(),
  // 할인 없으면 regularPrice와 동일. DB CHECK와 동일 invariant를 입력단에서도 강제.
  salePrice: z.number().int().nonnegative(),
  stockQuantity: z.number().int().nonnegative().default(0),
  saleStatus: z.enum(SALE_STATUSES).default("draft"),
  // 카탈로그 계층·외부 시세 — 임포트가 채우고 관리자 화면에서도 수정 가능.
  seriesId: z.number().int().positive().nullable().optional(),
  marketAvgJpy: z.number().int().nonnegative().optional(),
  marketMinJpy: z.number().int().nonnegative().optional(),
  marketMaxJpy: z.number().int().nonnegative().optional(),
  marketSoldCount: z.number().int().nonnegative().optional(),
  retailPriceJpy: z.number().int().nonnegative().optional(),
  // 판매 방식 — auction이면 시작가·마감시각 필수(액션에서 전이 계획으로 검증).
  // default는 create 스키마에서만 부여 — .partial() 후에도 default가 채워지면
  // 모든 update가 "fixed"를 명시 입력한 것처럼 취급돼 경매 전이가 오작동한다.
  saleMode: z.enum(SALE_MODES),
  auctionStartPrice: z.number().int().positive().nullable().optional(),
  // ISO 문자열(타임존 포함) — 클라이언트가 datetime-local 값을 toISOString으로 변환해 전송.
  auctionEndsAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  photos: z
    .array(productPhotoInputSchema)
    .min(1, "사진은 최소 1장 이상")
    .refine(
      (photos) => photos.filter((photo) => photo.isThumbnail).length === 1,
      "썸네일은 정확히 1장 지정",
    ),
});

const SALE_LE_REGULAR_MESSAGE = "할인가는 정가 이하여야 합니다";

export const productCreateSchema = productInputBase
  .extend({ saleMode: z.enum(SALE_MODES).default("fixed") })
  .refine((data) => data.salePrice <= data.regularPrice, {
    message: SALE_LE_REGULAR_MESSAGE,
    path: ["salePrice"],
  });

export const productUpdateSchema = productInputBase
  .partial()
  .extend({ id: z.number().int().positive() })
  .refine(
    (data) =>
      data.salePrice === undefined ||
      data.regularPrice === undefined ||
      data.salePrice <= data.regularPrice,
    { message: SALE_LE_REGULAR_MESSAGE, path: ["salePrice"] },
  );

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductPhotoInput = z.infer<typeof productPhotoInputSchema>;
