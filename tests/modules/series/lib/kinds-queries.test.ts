import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  seriesKind: { findMany: vi.fn() },
  series: { groupBy: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: m }));

import {
  buildKindLabelMap,
  countSeriesByKind,
  listSeriesKinds,
  sortKindKeys,
  type SeriesKind,
} from "@/modules/series/lib/kinds-queries";

beforeEach(() => vi.clearAllMocks());

const kinds: SeriesKind[] = [
  { id: 1, key: "random", label: "정규", displayOrder: 1 },
  { id: 2, key: "event", label: "이벤트(수정)", displayOrder: 3 },
  { id: 3, key: "others", label: "기타", displayOrder: 99 },
];

describe("listSeriesKinds", () => {
  it("순서→키로 정렬해 조회하고 BigInt id 를 number 로 바꾼다", async () => {
    m.seriesKind.findMany.mockResolvedValue([
      { id: BigInt(1), key: "random", label: "정규", displayOrder: 1 },
    ]);
    const out = await listSeriesKinds();
    expect(m.seriesKind.findMany).toHaveBeenCalledWith({
      orderBy: [{ displayOrder: "asc" }, { key: "asc" }],
    });
    expect(out).toEqual([{ id: 1, key: "random", label: "정규", displayOrder: 1 }]);
  });
});

describe("buildKindLabelMap", () => {
  it("DB 라벨이 코드 상수를 덮어쓰고, DB 에 없는 키는 상수 라벨을 유지한다", () => {
    const map = buildKindLabelMap(kinds);
    expect(map.event).toBe("이벤트(수정)"); // DB 우선
    expect(map.costume).toBe("의상"); // 상수 폴백
    expect(map.random).toBe("정규");
  });
});

describe("sortKindKeys", () => {
  it("DB 순서를 따르고, 없는 키는 뒤에 알파벳순, others 는 맨 뒤", () => {
    expect(sortKindKeys(["others", "zzz", "event", "aaa", "random"], kinds)).toEqual([
      "random",
      "event",
      "aaa",
      "zzz",
      "others",
    ]);
  });
});

describe("countSeriesByKind", () => {
  it("종류별 시리즈 수를 맵으로 돌려준다", async () => {
    m.series.groupBy.mockResolvedValue([
      { kind: "random", _count: { _all: 14 } },
      { kind: "event", _count: { _all: 5 } },
    ]);
    expect(await countSeriesByKind()).toEqual({ random: 14, event: 5 });
  });
});
