import { z } from "zod";
import { PHOTO_ALLOWED_TYPES } from "@/lib/photo-client";
import { POST_TOPICS, REPORT_REASONS, REPORT_TARGETS } from "../types";

export const POST_TITLE_MAX = 80;
export const POST_BODY_MAX = 5_000;
export const COMMENT_BODY_MAX = 1_000;
export const REPORT_DETAIL_MAX = 500;
export const HIDE_REASON_MAX = 500;
export const RESOLUTION_NOTE_MAX = 1_000;
export const POST_PAGE_SIZE = 20;

// 사진 정책(§결정 8) — 재인코딩된 최종 Blob 기준으로 검사.
export const PHOTO_MAX_COUNT = 10;
export const PHOTO_MAX_FILE_BYTES = 5 * 1024 * 1024; // 파일당 5MB
export const PHOTO_MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 글 합계 30MB
export const PHOTO_MAX_DIMENSION = 8_000; // 서버 픽셀 상한(방어선)
// 재업로드가 필요한 실패의 도메인 에러 코드(P2-3). 클라이언트 폼도 이 코드를 보고 첨부를 비우므로
// server-only인 pending-photo이 아니라 client-safe한 schema에 둔다.
export const PHOTO_RETRY_CODE = "photo_retry";

// rate limit 이중 윈도. 신고는 글·댓글 신고 COUNT "합산" 상한(스펙 §9).
export const RATE_LIMITS = {
  post:    [{ seconds: 3600, max: 5 }, { seconds: 86_400, max: 20 }],
  comment: [{ seconds: 60, max: 5 },   { seconds: 3600, max: 60 }],
  report:  [{ seconds: 600, max: 5 },  { seconds: 86_400, max: 20 }],
  // presign은 생성되는 대기 사진 수 기준(§9) — mutations가 requested로 장수를 넘긴다.
  presign: [{ seconds: 3600, max: 30 }, { seconds: 86_400, max: 100 }],
} as const;

const trimmed = (max: number, label: string) =>
  z.string().trim()
    .min(1, `${label}을 입력해주세요`)
    .max(max, `${label}은 ${max.toLocaleString()}자 이내여야 합니다`);

// 선택 입력 — trim 후 빈 값이면 undefined 정규화(빈 문자열 저장 방지).
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => {
      if (v == null) return undefined;
      if (typeof v !== "string") return v;
      const t = v.trim();
      return t === "" ? undefined : t;
    },
    z.string().max(max).optional(),
  );

const positiveId = z.number().int().positive();

export const POST_LINK_LABEL_MAX = 60;
export const POST_PLACE_MAX = 120;

// 외부 링크 — http(s)만(javascript: 등 스킴 차단), 빈 값은 undefined로 정규화.
const optionalLinkUrl = z.preprocess(
  (v) => {
    if (v == null) return undefined;
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? undefined : t;
  },
  z
    .string()
    .url("올바른 링크 주소가 아닙니다")
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "http(s) 링크만 첨부할 수 있습니다")
    .optional(),
);

// 공통 콘텐츠 필드(plain object — create/update가 각자 확장 후 규칙 refine).
const postContentShape = {
  topic: z.enum(POST_TOPICS),
  title: trimmed(POST_TITLE_MAX, "제목"),
  body: trimmed(POST_BODY_MAX, "본문"),
  // 최애 태그·토레카 첨부 — 선택.
  teamId: positiveId.nullable().optional(),
  memberId: positiveId.nullable().optional(),
  cardId: positiveId.nullable().optional(),
  // 링크 첨부 — 전 게시판 공통.
  linkUrl: optionalLinkUrl,
  linkLabel: optionalTrimmed(POST_LINK_LABEL_MAX),
  // 이벤트 구조화 필드 — event 토픽에서 일시 필수.
  eventStartsAt: z.string().datetime({ offset: true }).nullable().optional(),
  eventEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
  eventPlace: optionalTrimmed(POST_PLACE_MAX),
} as const;

type ContentRuleInput = {
  topic: (typeof POST_TOPICS)[number];
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
};
// event 토픽 일시 필수 + 기간 순서 검증. create·update 공통 적용.
function applyContentRules<T extends ContentRuleInput>(schema: z.ZodType<T>) {
  return schema
    .refine((v) => v.topic !== "event" || !!v.eventStartsAt, {
      message: "이벤트 일시를 입력해주세요",
      path: ["eventStartsAt"],
    })
    .refine(
      (v) => !v.eventEndsAt || !v.eventStartsAt || v.eventEndsAt >= v.eventStartsAt,
      { message: "종료 일시가 시작보다 앞설 수 없습니다", path: ["eventEndsAt"] },
    );
}

export const postCreateSchema = applyContentRules(
  z.object({
    ...postContentShape,
    photos: z
      .array(z.object({ pendingPhotoId: positiveId }))
      .max(PHOTO_MAX_COUNT, `사진은 최대 ${PHOTO_MAX_COUNT}장입니다`)
      .default([])
      .refine(
        (photos) => new Set(photos.map((p) => p.pendingPhotoId)).size === photos.length,
        "같은 사진이 중복 제출되었습니다",
      ),
  }),
);
// 수정은 photos를 받지 않는다(§11 — 사진은 생성 시에만). 메타(태그·링크·이벤트)는 수정 가능.
export const postUpdateSchema = applyContentRules(
  z.object({ ...postContentShape, id: positiveId }),
);
export const idSchema = positiveId; // 삭제·숨김·해제 등 단일 ID 입력 검증

export const commentCreateSchema = z.object({
  postId: positiveId,
  parentId: positiveId.optional(),
  body: trimmed(COMMENT_BODY_MAX, "댓글"),
});
export const commentUpdateSchema = z.object({ id: positiveId, body: trimmed(COMMENT_BODY_MAX, "댓글") });

export const reportCreateSchema = z.object({
  targetId: positiveId,
  reason: z.enum(REPORT_REASONS),
  detail: optionalTrimmed(REPORT_DETAIL_MAX),
});

// presign 입력 — 최종 Blob의 type·size(클라 재인코딩 후 확정값). 합계 30MB refine.
export const presignPhotosSchema = z
  .object({
    files: z
      .array(
        z.object({
          contentType: z.enum(PHOTO_ALLOWED_TYPES, {
            message: "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)",
          }),
          sizeBytes: z
            .number()
            .int()
            .positive()
            .max(PHOTO_MAX_FILE_BYTES, "사진은 파일당 5MB 이하여야 합니다"),
        }),
      )
      .min(1, "사진이 없습니다")
      .max(PHOTO_MAX_COUNT, `사진은 최대 ${PHOTO_MAX_COUNT}장입니다`),
  })
  .refine((v) => v.files.reduce((sum, f) => sum + f.sizeBytes, 0) <= PHOTO_MAX_TOTAL_BYTES, {
    message: "사진 합계는 30MB 이하여야 합니다",
  });

// admin 증거 signer 입력(P1-4) — 글 신고 전용(댓글 스냅샷엔 사진이 없다).
export const evidenceSchema = z.object({
  reportId: positiveId,
  photoIndex: z.number().int().min(0),
});

export const hideSchema = z.object({ targetId: positiveId, reason: trimmed(HIDE_REASON_MAX, "숨김 사유") });
export const unhideSchema = z.object({ targetId: positiveId });
// 단독 resolve는 dismissed 전용 — actioned는 숨김 tx에서만 세팅(§Global Constraints).
export const dismissSchema = z.object({
  target: z.enum(REPORT_TARGETS),
  reportId: positiveId,
  note: optionalTrimmed(RESOLUTION_NOTE_MAX),
});

// 공개 목록 searchParams — 관용 파싱(오값은 기본값), q는 trim.
export const postListParamsSchema = z.object({
  topic: z.enum(POST_TOPICS).optional().catch(undefined),
  q: optionalTrimmed(POST_TITLE_MAX).catch(undefined),
  fave: z
    .preprocess((v) => v === "1" || v === "true", z.boolean())
    .catch(false),
  page: z.coerce.number().int().positive().catch(1).default(1),
});

// 신고 스냅샷 v1(텍스트 전용) — Plan 3에서 사진 키는 version 확장으로.
export const postReportSnapshotV1 = z.object({
  version: z.literal(1),
  title: z.string(),
  body: z.string(),
  authorName: z.string(),
  authorCode: z.string(),
  updatedAt: z.string(),
});
// 신고 스냅샷 v2 — 신고 당시 사진 키·표시 순서 동결(P1-5). Plan 3 배포 후 글 신고는
// 사진이 없어도 항상 v2(photos: [])로 저장하고, v1은 읽기 호환만 유지한다.
export const postReportSnapshotV2 = postReportSnapshotV1.omit({ version: true }).extend({
  version: z.literal(2),
  photos: z.array(z.object({ r2Key: z.string(), displayOrder: z.number().int() })),
});
export const postReportSnapshot = z.discriminatedUnion("version", [
  postReportSnapshotV1,
  postReportSnapshotV2,
]);

export const commentReportSnapshotV1 = z.object({
  version: z.literal(1),
  body: z.string(),
  authorName: z.string(),
  authorCode: z.string(),
  updatedAt: z.string(),
});

export type PostCreateInput = z.input<typeof postCreateSchema>;
export type PostUpdateInput = z.input<typeof postUpdateSchema>;
export type CommentCreateInput = z.input<typeof commentCreateSchema>;
export type CommentUpdateInput = z.input<typeof commentUpdateSchema>;
export type ReportCreateInput = z.input<typeof reportCreateSchema>;
