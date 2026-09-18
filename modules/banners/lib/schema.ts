import { z } from "zod";

// 배너 생성/수정 입력 검증. 날짜는 "YYYY-MM-DD" 또는 빈값(무제한).
const dateOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "날짜 형식이 올바르지 않습니다.");

export const bannerCreateSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요."),
  imageKey: z.string().trim().min(1, "배너 이미지를 업로드해 주세요."),
  linkUrl: z.string().trim().url("올바른 링크 URL이 아닙니다."),
  startsAt: dateOrEmpty.optional().default(""),
  endsAt: dateOrEmpty.optional().default(""),
  sortOrder: z.coerce.number().int().default(0),
});

export const bannerUpdateSchema = bannerCreateSchema.extend({
  id: z.coerce.number().int(),
});

export type BannerCreateInput = z.input<typeof bannerCreateSchema>;
export type BannerUpdateInput = z.input<typeof bannerUpdateSchema>;
