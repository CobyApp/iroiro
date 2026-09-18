import { describe, expect, it, vi } from "vitest";
import type { Notice as PrismaNotice } from "@prisma/client";

import { toNotice } from "@/modules/notices/lib/transform";

vi.mock("@/lib/r2/presign", () => ({
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));

describe("toNotice", () => {
  it("Prisma row를 DTO로 변환한다 (BigInt→number, Date→ISO)", () => {
    const row = {
      id: 3n,
      publicCode: "AbCdEfGh1234",
      category: "event",
      title: "이벤트",
      body: "본문",
      isPinned: true,
      deletedAt: null,
      createdAt: new Date("2026-07-19T00:00:00Z"),
      createdBy: "mock-admin",
      updatedAt: new Date("2026-07-19T01:00:00Z"),
      updatedBy: "mock-admin",
    } satisfies PrismaNotice;

    expect(toNotice(row)).toEqual({
      id: 3,
      publicCode: "AbCdEfGh1234",
      category: "event",
      title: "이벤트",
      body: "본문",
      isPinned: true,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T01:00:00.000Z",
      photos: [],
    });
  });

  it("photos 인자를 display 순서 그대로 URL 매핑한다", () => {
    const row = {
      id: 3n,
      publicCode: "AbCdEfGh1234",
      category: "event",
      title: "이벤트",
      body: "본문",
      isPinned: true,
      deletedAt: null,
      createdAt: new Date("2026-07-19T00:00:00Z"),
      createdBy: "mock-admin",
      updatedAt: new Date("2026-07-19T01:00:00Z"),
      updatedBy: "mock-admin",
    } satisfies PrismaNotice;

    const result = toNotice(row, [
      { r2Key: "notices/original/a.jpg" },
      { r2Key: "notices/original/b.webp" },
    ]);

    expect(result.photos).toEqual([
      { r2Key: "notices/original/a.jpg", url: "https://cdn.test/notices/original/a.jpg" },
      { r2Key: "notices/original/b.webp", url: "https://cdn.test/notices/original/b.webp" },
    ]);
  });
});
