import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  series: { findMany: vi.fn() },
  card: { groupBy: vi.fn() },
  product: { groupBy: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: m }));

import {
  listSeriesOptions,
  listSeriesWithCounts,
  seriesDisplayLabel,
} from "@/modules/series/lib/queries";

beforeEach(() => vi.clearAllMocks());

describe("listSeriesWithCounts", () => {
  it("label_i18n.ko 를 labelKo 로 풀고, 공개 카드·상품 수를 시리즈별로 붙인다", async () => {
    m.series.findMany.mockResolvedValue([
      { id: BigInt(1), sku: "A", label: "クリスマス", labelI18n: { ko: "크리스마스" }, kind: "event", teamId: BigInt(7) },
      { id: BigInt(2), sku: "B", label: "Regular", labelI18n: null, kind: "random", teamId: null },
      { id: BigInt(3), sku: "C", label: "空", labelI18n: { ko: "  " }, kind: "random", teamId: BigInt(7) },
    ]);
    m.card.groupBy.mockResolvedValue([
      { seriesId: BigInt(1), _count: { _all: 12 } },
      { seriesId: null, _count: { _all: 3 } },
    ]);
    m.product.groupBy.mockResolvedValue([{ seriesId: BigInt(2), _count: { _all: 4 } }]);

    const out = await listSeriesWithCounts();

    // 카드 수는 공개(active) 카드만 집계한다
    expect(m.card.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active" } }),
    );
    expect(out).toEqual([
      { id: 1, sku: "A", label: "クリスマス", labelKo: "크리스마스", kind: "event", teamId: 7, cardCount: 12, productCount: 0 },
      { id: 2, sku: "B", label: "Regular", labelKo: null, kind: "random", teamId: null, cardCount: 0, productCount: 4 },
      // 공백만 있는 ko 는 없는 것으로 본다
      { id: 3, sku: "C", label: "空", labelKo: null, kind: "random", teamId: 7, cardCount: 0, productCount: 0 },
    ]);
  });
});

describe("seriesDisplayLabel", () => {
  it("한국어 병기가 있고 원문과 다르면 「원문 (한국어)」", () => {
    expect(seriesDisplayLabel({ label: "クリスマス", labelKo: "크리스마스" })).toBe("クリスマス (크리스마스)");
  });
  it("병기가 없거나 원문과 같으면 원문만", () => {
    expect(seriesDisplayLabel({ label: "Regular", labelKo: null })).toBe("Regular");
    expect(seriesDisplayLabel({ label: "정규", labelKo: "정규" })).toBe("정규");
  });
});

describe("listSeriesOptions", () => {
  it("선택지 라벨에 한국어 병기를 합쳐 돌려준다", async () => {
    m.series.findMany.mockResolvedValue([
      { id: BigInt(5), teamId: BigInt(1), label: "夏", labelI18n: { ko: "여름" }, kind: "event" },
    ]);
    expect(await listSeriesOptions()).toEqual([
      { id: 5, teamId: 1, label: "夏 (여름)", kind: "event" },
    ]);
    expect(m.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { label: "asc" } }),
    );
  });
});
