import { beforeEach, describe, expect, it, vi } from "vitest";

// 조회 계층은 DB 호출을 mock하고 "행 → 도메인 타입 변환"과 활성 필터만 검증한다.
// 게시기간 판정 자체는 lib/active의 isBannerActiveAt 단위 테스트가 담당한다.
const findMany = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { banner: { findMany, findUnique } } }));

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1n,
    title: "여름 세일",
    imageKey: "banners/a.png",
    linkUrl: "/products",
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listBanners", () => {
  it("bigint id를 number로, 날짜를 ISO 문자열로 바꿔 반환한다", async () => {
    findMany.mockResolvedValue([
      row({
        id: 7n,
        startsAt: new Date("2026-07-01T00:00:00Z"),
        endsAt: new Date("2026-07-31T00:00:00Z"),
      }),
    ]);
    const { listBanners } = await import("@/modules/banners/lib/queries");

    expect(await listBanners()).toEqual([
      {
        id: 7,
        title: "여름 세일",
        imageKey: "banners/a.png",
        linkUrl: "/products",
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-07-31T00:00:00.000Z",
        sortOrder: 0,
      },
    ]);
  });

  it("정렬 순서 → 최신순으로 조회한다", async () => {
    findMany.mockResolvedValue([]);
    const { listBanners } = await import("@/modules/banners/lib/queries");
    await listBanners();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  });

  it("관리자 목록은 게시기간과 무관하게 전부 반환한다", async () => {
    findMany.mockResolvedValue([
      row({ id: 1n, endsAt: new Date("2020-01-01T00:00:00Z") }), // 이미 종료
      row({ id: 2n, startsAt: new Date("2999-01-01T00:00:00Z") }), // 아직 시작 전
    ]);
    const { listBanners } = await import("@/modules/banners/lib/queries");

    expect((await listBanners()).map((b) => b.id)).toEqual([1, 2]);
  });
});

describe("getActiveBanners", () => {
  it("게시기간이 지났거나 아직 시작 안 한 배너는 제외한다", async () => {
    findMany.mockResolvedValue([
      row({ id: 1n }), // 기간 제한 없음 → 항상 활성
      row({ id: 2n, endsAt: new Date("2020-01-01T00:00:00Z") }), // 종료됨
      row({ id: 3n, startsAt: new Date("2999-01-01T00:00:00Z") }), // 시작 전
    ]);
    const { getActiveBanners } = await import("@/modules/banners/lib/queries");

    expect((await getActiveBanners()).map((b) => b.id)).toEqual([1]);
  });

  it("활성 배너가 없으면 빈 배열", async () => {
    findMany.mockResolvedValue([
      row({ id: 2n, endsAt: new Date("2020-01-01T00:00:00Z") }),
    ]);
    const { getActiveBanners } = await import("@/modules/banners/lib/queries");

    expect(await getActiveBanners()).toEqual([]);
  });
});

describe("getBanner", () => {
  it("number id를 BigInt로 바꿔 조회한다", async () => {
    findUnique.mockResolvedValue(row({ id: 12n }));
    const { getBanner } = await import("@/modules/banners/lib/queries");

    expect((await getBanner(12))?.id).toBe(12);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 12n } });
  });

  it("없으면 null", async () => {
    findUnique.mockResolvedValue(null);
    const { getBanner } = await import("@/modules/banners/lib/queries");

    expect(await getBanner(999)).toBeNull();
  });
});
