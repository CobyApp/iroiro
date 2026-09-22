import { z } from "zod";
import { REVIEW_REPORT_REASONS } from "../types";

export const MAX_REVIEW_BODY = 1000;

// 리뷰 신고·처리 입력 길이 상한(글/중고 신고와 동일 어휘).
export const REVIEW_REPORT_DETAIL_MAX = 500;
export const REVIEW_HIDE_REASON_MAX = 500;
export const REVIEW_RESOLUTION_NOTE_MAX = 1_000;

const positiveId = z.number().int().positive();
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : (v ?? undefined)),
    z.string().max(max).optional(),
  );

// 고객 신고 입력 — 대상 리뷰 + 사유(+ 상세 선택).
export const reviewReportCreateSchema = z.object({
  reviewId: positiveId,
  reason: z.enum(REVIEW_REPORT_REASONS),
  detail: optionalText(REVIEW_REPORT_DETAIL_MAX),
});
export type ReviewReportCreateInput = z.input<typeof reviewReportCreateSchema>;

// 관리자 리뷰 숨김 입력 — 사유 필수(관리 메모).
export const reviewHideSchema = z.object({
  reviewId: positiveId,
  reason: z.string().trim().min(1, "숨김 사유를 입력해주세요").max(REVIEW_HIDE_REASON_MAX),
});
export type ReviewHideInput = z.input<typeof reviewHideSchema>;

// 관리자 신고 기각 입력 — 메모 선택.
export const reviewDismissReportSchema = z.object({
  reportId: positiveId,
  note: optionalText(REVIEW_RESOLUTION_NOTE_MAX),
});
export type ReviewDismissReportInput = z.input<typeof reviewDismissReportSchema>;

// 단일 리뷰 ID 입력(숨김 해제 등).
export const reviewIdSchema = z.object({ reviewId: positiveId });
export type ReviewIdInput = z.input<typeof reviewIdSchema>;

export const reviewUpsertSchema = z.object({
  orderId: z.number().int().positive(),
  productId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(MAX_REVIEW_BODY),
});

export const reviewDeleteSchema = z.object({
  reviewId: z.number().int().positive(),
});

export type ReviewUpsertInput = z.infer<typeof reviewUpsertSchema>;
export type ReviewDeleteInput = z.infer<typeof reviewDeleteSchema>;
