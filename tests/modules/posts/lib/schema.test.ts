import { describe, expect, it } from "vitest";
import {
  postCreateSchema, postUpdateSchema, commentCreateSchema, reportCreateSchema, dismissSchema,
  hideSchema, unhideSchema, postReportSnapshotV1, commentReportSnapshotV1, postReportSnapshot,
  presignPhotosSchema, postListParamsSchema, POST_TITLE_MAX, POST_BODY_MAX, COMMENT_BODY_MAX,
  HIDE_REASON_MAX, PHOTO_MAX_FILE_BYTES,
} from "@/modules/posts/lib/schema";

describe("postCreateSchema", () => {
  const valid = { topic: "community", title: "제목", body: "본문" };
  it("정상 입력 통과", () => {
    expect(postCreateSchema.parse(valid).topic).toBe("community");
  });
  it("topic은 필수·enum만 — 생략/오값 거부", () => {
    expect(() => postCreateSchema.parse({ title: "t", body: "b" })).toThrow();
    expect(() => postCreateSchema.parse({ ...valid, topic: "notice" })).toThrow();
  });
  it("trim 후 공백만인 제목·본문 거부", () => {
    expect(() => postCreateSchema.parse({ ...valid, title: "   " })).toThrow();
    expect(() => postCreateSchema.parse({ ...valid, body: "\n\t " })).toThrow();
  });
  it("길이 상한(제목 80·본문 5,000)", () => {
    expect(() => postCreateSchema.parse({ ...valid, title: "가".repeat(POST_TITLE_MAX + 1) })).toThrow();
    expect(() => postCreateSchema.parse({ ...valid, body: "가".repeat(POST_BODY_MAX + 1) })).toThrow();
  });
});

describe("commentCreateSchema", () => {
  it("parentId 없거나 양의 정수, 본문 필수·상한", () => {
    expect(commentCreateSchema.parse({ postId: 1, body: "안녕" }).parentId).toBeUndefined();
    expect(commentCreateSchema.parse({ postId: 1, parentId: 3, body: "답글" }).parentId).toBe(3);
    expect(() => commentCreateSchema.parse({ postId: 1, body: "   " })).toThrow();
    expect(() => commentCreateSchema.parse({ postId: 1, body: "가".repeat(COMMENT_BODY_MAX + 1) })).toThrow();
  });
});

describe("reportCreateSchema", () => {
  it("reason enum만, detail 선택·상한, 공백 detail은 undefined 정규화", () => {
    expect(reportCreateSchema.parse({ targetId: 1, reason: "spam" }).reason).toBe("spam");
    expect(reportCreateSchema.parse({ targetId: 1, reason: "spam", detail: "   " }).detail).toBeUndefined();
    expect(() => reportCreateSchema.parse({ targetId: 1, reason: "bogus" })).toThrow();
    expect(() => reportCreateSchema.parse({ targetId: 1, reason: "spam", detail: "가".repeat(501) })).toThrow();
  });
});

describe("dismissSchema", () => {
  it("target 판별자 필수(post|comment) — 두 신고 테이블 ID 독립", () => {
    expect(dismissSchema.parse({ target: "post", reportId: 1 }).target).toBe("post");
    expect(() => dismissSchema.parse({ reportId: 1 })).toThrow();
    expect(() => dismissSchema.parse({ target: "user", reportId: 1 })).toThrow();
  });
  it("note는 선택 입력 — 생략 가능, 공백만이면 undefined로 정규화, 1,000자 초과는 거부", () => {
    expect(dismissSchema.parse({ target: "post", reportId: 1 }).note).toBeUndefined();
    expect(dismissSchema.parse({ target: "post", reportId: 1, note: "   " }).note).toBeUndefined();
    expect(dismissSchema.parse({ target: "post", reportId: 1, note: "확인함" }).note).toBe("확인함");
    expect(() =>
      dismissSchema.parse({ target: "post", reportId: 1, note: "가".repeat(1001) }),
    ).toThrow();
  });
});

describe("hideSchema", () => {
  it("targetId·reason 모두 필수, 사유는 trim 후 공백만이면 거부, 500자 상한", () => {
    expect(hideSchema.parse({ targetId: 1, reason: "스팸" }).reason).toBe("스팸");
    expect(() => hideSchema.parse({ targetId: 1 })).toThrow();
    expect(() => hideSchema.parse({ targetId: 1, reason: "   " })).toThrow();
    expect(() => hideSchema.parse({ targetId: 1, reason: "가".repeat(HIDE_REASON_MAX + 1) })).toThrow();
  });
});

describe("unhideSchema", () => {
  it("targetId만 필수(양의 정수)", () => {
    expect(unhideSchema.parse({ targetId: 1 }).targetId).toBe(1);
    expect(() => unhideSchema.parse({ targetId: 0 })).toThrow();
    expect(() => unhideSchema.parse({})).toThrow();
  });
});

describe("postReportSnapshotV1 / commentReportSnapshotV1", () => {
  it("version 1 고정 스키마 — 필드 누락·버전 불일치는 거부한다", () => {
    const post = {
      version: 1 as const, title: "제목", body: "본문",
      authorName: "작성자", authorCode: "AUTH0001", updatedAt: "2026-07-20T00:00:00.000Z",
    };
    expect(postReportSnapshotV1.parse(post)).toEqual(post);
    expect(() => postReportSnapshotV1.parse({ ...post, version: 2 })).toThrow();
    expect(() => postReportSnapshotV1.parse({ ...post, title: undefined })).toThrow();

    const comment = {
      version: 1 as const, body: "댓글",
      authorName: "작성자", authorCode: "AUTH0001", updatedAt: "2026-07-20T00:00:00.000Z",
    };
    expect(commentReportSnapshotV1.parse(comment)).toEqual(comment);
    expect(() => commentReportSnapshotV1.parse({ ...comment, version: 2 })).toThrow();
  });
});

describe("postListParamsSchema", () => {
  it("잘못된 topic·page는 기본값으로 관용 파싱, q는 trim", () => {
    const parsed = postListParamsSchema.parse({ topic: "bogus", page: "-3", q: "  검색어  " });
    expect(parsed.topic).toBeUndefined();
    expect(parsed.page).toBe(1);
    expect(parsed.q).toBe("검색어");
  });
});

describe("presignPhotosSchema", () => {
  const file = (over: Partial<{ contentType: string; sizeBytes: number }> = {}) => ({
    contentType: "image/jpeg",
    sizeBytes: 1024,
    ...over,
  });

  it("정상 1장 통과", () => {
    expect(presignPhotosSchema.safeParse({ files: [file()] }).success).toBe(true);
  });

  it("heic 등 미허용 MIME 거부(HEIC 미지원 — P2-4)", () => {
    expect(presignPhotosSchema.safeParse({ files: [file({ contentType: "image/heic" })] }).success)
      .toBe(false);
  });

  it("파일당 5MB 초과 거부", () => {
    expect(
      presignPhotosSchema.safeParse({ files: [file({ sizeBytes: PHOTO_MAX_FILE_BYTES + 1 })] })
        .success,
    ).toBe(false);
  });

  it("11장 거부·합계 30MB 초과 거부", () => {
    expect(
      presignPhotosSchema.safeParse({ files: Array.from({ length: 11 }, () => file()) }).success,
    ).toBe(false);
    const sevenFiveMb = Array.from({ length: 7 }, () => file({ sizeBytes: PHOTO_MAX_FILE_BYTES }));
    expect(presignPhotosSchema.safeParse({ files: sevenFiveMb }).success).toBe(false); // 35MB
  });
});

describe("postCreateSchema.photos / postUpdateSchema", () => {
  it("photos 생략 시 빈 배열 기본값", () => {
    expect(postCreateSchema.parse({ topic: "community", title: "t", body: "b" }).photos).toEqual([]);
  });

  it("photos pendingPhotoId 중복 거부·10장 초과 거부", () => {
    const dup = { topic: "community", title: "t", body: "b", photos: [{ pendingPhotoId: 1 }, { pendingPhotoId: 1 }] };
    expect(postCreateSchema.safeParse(dup).success).toBe(false);
    const eleven = {
      topic: "community",
      title: "t",
      body: "b",
      photos: Array.from({ length: 11 }, (_, i) => ({ pendingPhotoId: i + 1 })),
    };
    expect(postCreateSchema.safeParse(eleven).success).toBe(false);
  });

  it("수정 스키마는 photos를 받지 않는다(§11 — 사진은 생성 시에만)", () => {
    const parsed = postUpdateSchema.parse({
      id: 1,
      topic: "community",
      title: "t",
      body: "b",
      photos: [{ pendingPhotoId: 1 }],
    } as never);
    expect("photos" in parsed).toBe(false); // strip
  });
});

describe("신고 스냅샷 v1|v2 union(P1-5)", () => {
  const base = {
    title: "t",
    body: "b",
    authorName: "a",
    authorCode: "c",
    updatedAt: "2026-07-26T00:00:00.000Z",
  };

  it("v1 파싱 호환 유지", () => {
    expect(postReportSnapshot.safeParse({ version: 1, ...base }).success).toBe(true);
  });

  it("v2는 photos(r2Key·displayOrder) 필수 — 빈 배열 허용", () => {
    expect(postReportSnapshot.safeParse({ version: 2, ...base, photos: [] }).success).toBe(true);
    expect(
      postReportSnapshot.safeParse({
        version: 2,
        ...base,
        photos: [{ r2Key: "posts/a.jpg", displayOrder: 0 }],
      }).success,
    ).toBe(true);
    expect(postReportSnapshot.safeParse({ version: 2, ...base }).success).toBe(false);
  });
});
