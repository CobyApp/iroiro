import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const photoFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    notice: { findMany, findFirst },
    noticePhoto: { findMany: photoFindMany },
  },
}));

vi.mock("@/lib/r2/presign", () => ({
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));

const row = {
  id: 1n,
  publicCode: "AbCdEfGh1234",
  category: "general",
  title: "공지",
  body: "본문",
  isPinned: false,
  deletedAt: null,
  createdAt: new Date("2026-07-19T00:00:00Z"),
  createdBy: null,
  updatedAt: new Date("2026-07-19T00:00:00Z"),
  updatedBy: null,
};

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset().mockResolvedValue([row]);
  findFirst.mockReset().mockResolvedValue(row);
  photoFindMany.mockReset().mockResolvedValue([]);
});

describe("notices queries", () => {
  it("listNotices — 삭제 제외 + 고정 우선 정렬 인자로 조회한다", async () => {
    const { listNotices } = await import("@/modules/notices/lib/queries");
    const result = await listNotices();

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    expect(result[0].publicCode).toBe("AbCdEfGh1234");
  });

  it("listHomeNotices — 기본 2건 take", async () => {
    const { listHomeNotices } = await import("@/modules/notices/lib/queries");
    await listHomeNotices();
    expect(findMany.mock.calls[0][0].take).toBe(2);
  });

  it("getNoticeByPublicCode — 삭제 공지는 조회 조건에서 제외된다", async () => {
    const { getNoticeByPublicCode } = await import(
      "@/modules/notices/lib/queries"
    );
    await getNoticeByPublicCode("AbCdEfGh1234");
    expect(findFirst).toHaveBeenCalledWith({
      where: { publicCode: "AbCdEfGh1234", deletedAt: null },
    });
  });

  it("getNoticeById — BigInt 변환 + 삭제 제외", async () => {
    const { getNoticeById } = await import("@/modules/notices/lib/queries");
    await getNoticeById(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 1n, deletedAt: null },
    });
  });

  it("getNoticeByPublicCode — 사진을 display_order 순으로 포함한다", async () => {
    photoFindMany.mockResolvedValue([
      { id: 1n, noticeId: 1n, r2Key: "notices/original/a.jpg", displayOrder: 0, createdAt: new Date() },
    ]);
    const { getNoticeByPublicCode } = await import("@/modules/notices/lib/queries");
    const result = await getNoticeByPublicCode("AbCdEfGh1234");

    expect(photoFindMany).toHaveBeenCalledWith({
      where: { noticeId: 1n },
      orderBy: { displayOrder: "asc" },
    });
    expect(result?.photos).toEqual([
      { r2Key: "notices/original/a.jpg", url: "https://cdn.test/notices/original/a.jpg" },
    ]);
  });

  it("listNotices — 목록은 사진을 조회하지 않는다(빈 배열)", async () => {
    const { listNotices } = await import("@/modules/notices/lib/queries");
    const result = await listNotices();
    expect(photoFindMany).not.toHaveBeenCalled();
    expect(result[0].photos).toEqual([]);
  });
});
