import { z } from "zod";
import { NOTICE_CATEGORIES } from "../types";

export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 10_000;
// 상단 고정 전역 최대 개수 — 초기값 3(운영 보며 조정). 팬카페 필독 공지 선례 (스펙 §확정 결정 7)
export const NOTICE_PIN_LIMIT = 3;
export const NOTICE_PHOTO_MAX_COUNT = 10;
export const NOTICE_PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024; // 파일당 5MB

// r2Key prefix 검사 — 타 도메인 키·경로 오입력을 데이터 경계에서 차단 (스펙 §업로드 플로우)
const photosSchema = z
  .array(z.string().regex(/^notices\/original\/[^/]+$/, "잘못된 사진 키입니다"))
  .max(NOTICE_PHOTO_MAX_COUNT, `사진은 최대 ${NOTICE_PHOTO_MAX_COUNT}장까지 첨부할 수 있습니다`);

const titleSchema = z
  .string()
  .trim()
  .min(1, "제목을 입력해주세요")
  .max(NOTICE_TITLE_MAX, `제목은 ${NOTICE_TITLE_MAX}자 이내여야 합니다`);

const bodySchema = z
  .string()
  .trim()
  .min(1, "본문을 입력해주세요")
  .max(NOTICE_BODY_MAX, `본문은 ${NOTICE_BODY_MAX.toLocaleString()}자 이내여야 합니다`);

export const noticeCreateSchema = z.object({
  category: z.enum(NOTICE_CATEGORIES),
  title: titleSchema,
  body: bodySchema,
  isPinned: z.boolean().default(false),
  // 생성은 빈 상태에서 시작하므로 생략 = 사진 없음으로 안전하다
  photos: photosSchema.default([]),
});

export const noticeUpdateSchema = z.object({
  id: z.number().int().positive(),
  category: z.enum(NOTICE_CATEGORIES),
  title: titleSchema,
  body: bodySchema,
  isPinned: z.boolean(),
  // 수정은 사진 전체 교체라 생략이 곧 전체 삭제다. 기본값을 두지 않아 호출부가 의도(유지분 재제출 vs
  // 비우기)를 명시하게 강제한다 — 생략은 타입 에러로 잡힌다.
  photos: photosSchema,
});

export type NoticeCreateInput = z.input<typeof noticeCreateSchema>;
export type NoticeUpdateInput = z.input<typeof noticeUpdateSchema>;
