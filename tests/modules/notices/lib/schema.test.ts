import { describe, expect, it } from "vitest";

import {
  NOTICE_BODY_MAX,
  NOTICE_PIN_LIMIT,
  NOTICE_TITLE_MAX,
  noticeCreateSchema,
  noticeUpdateSchema,
} from "@/modules/notices/lib/schema";

describe("noticeCreateSchema", () => {
  const valid = {
    category: "general",
    title: "점검 안내",
    body: "내일 새벽 점검이 있습니다.",
  };

  it("정상 입력을 통과시키고 isPinned 기본값(false)을 채운다", () => {
    const parsed = noticeCreateSchema.parse(valid);
    expect(parsed.category).toBe("general");
    expect(parsed.isPinned).toBe(false);
  });

  it("category는 필수다 — 생략하면 거부한다(기본값 없음)", () => {
    expect(() =>
      noticeCreateSchema.parse({ title: "제목", body: "본문" }),
    ).toThrow();
  });

  it("입력을 trim하고 공백만인 값은 거부한다", () => {
    expect(noticeCreateSchema.parse({ ...valid, title: "  공지  " }).title).toBe(
      "공지",
    );
    expect(() =>
      noticeCreateSchema.parse({ ...valid, title: "   " }),
    ).toThrow();
    expect(() => noticeCreateSchema.parse({ ...valid, body: "\n\t " })).toThrow();
  });

  it("길이 상한(제목 100·본문 10,000)을 강제한다", () => {
    expect(() =>
      noticeCreateSchema.parse({ ...valid, title: "가".repeat(NOTICE_TITLE_MAX + 1) }),
    ).toThrow();
    expect(() =>
      noticeCreateSchema.parse({ ...valid, body: "가".repeat(NOTICE_BODY_MAX + 1) }),
    ).toThrow();
    expect(
      noticeCreateSchema.parse({ ...valid, title: "가".repeat(NOTICE_TITLE_MAX) })
        .title,
    ).toHaveLength(NOTICE_TITLE_MAX);
  });

  it("카테고리는 general·event만 허용한다", () => {
    expect(
      noticeCreateSchema.parse({ ...valid, category: "event" }).category,
    ).toBe("event");
    expect(() =>
      noticeCreateSchema.parse({ ...valid, category: "notice" }),
    ).toThrow();
  });
});

describe("noticeUpdateSchema", () => {
  const valid = {
    id: 1,
    category: "general",
    title: "공지",
    body: "본문",
    isPinned: true,
    photos: [],
  };

  it("id 양의 정수를 요구한다", () => {
    expect(noticeUpdateSchema.parse(valid).id).toBe(1);
    expect(() => noticeUpdateSchema.parse({ ...valid, id: 0 })).toThrow();
  });

  it("photos 생략을 거부한다 — 전체 교체라 생략이 곧 전체 삭제 (create는 기본값 [])", () => {
    expect(() =>
      noticeUpdateSchema.parse({
        id: 1,
        category: "general",
        title: "공지",
        body: "본문",
        isPinned: true,
      }),
    ).toThrow();
    expect(
      noticeCreateSchema.parse({ category: "general", title: "공지", body: "본문" }).photos,
    ).toEqual([]);
  });
});

it("NOTICE_PIN_LIMIT은 3이다(초기 정책값)", () => {
  expect(NOTICE_PIN_LIMIT).toBe(3);
});
