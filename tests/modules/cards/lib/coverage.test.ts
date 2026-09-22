import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  card: { groupBy: vi.fn() },
  series: { findMany: vi.fn() },
}));

vi.mock("@/lib/catalog-db", () => ({ catalogDb: mocks }));

import {
  buildCoverageMatrix,
  coverageKey,
  getTeamCoverage,
  groupSeriesByKind,
  listActiveCardCoverage,
  listCoverageSeries,
} from "@/modules/cards/lib/coverage";

const KINDS = [
  { key: "random", label: "랜덤", displayOrder: 1 },
  { key: "event", label: "이벤트", displayOrder: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listActiveCardCoverage", () => {
  it("그룹의 공개 카드를 (멤버, 시리즈)로 집계하고 멤버·시리즈가 비어 있는 행은 버린다", async () => {
    mocks.card.groupBy.mockResolvedValue([
      { memberId: BigInt(1), seriesId: BigInt(10), _count: { _all: 3 } },
      { memberId: null, seriesId: BigInt(10), _count: { _all: 2 } },
      { memberId: BigInt(2), seriesId: null, _count: { _all: 1 } },
    ]);

    const out = await listActiveCardCoverage(7);

    expect(mocks.card.groupBy).toHaveBeenCalledWith({
      by: ["memberId", "seriesId"],
      where: { teamId: BigInt(7), status: "active" },
      _count: { _all: true },
    });
    expect(out).toEqual([{ memberId: 1, seriesId: 10, count: 3 }]);
  });
});

describe("listCoverageSeries", () => {
  it("그룹의 시리즈를 id·라벨·종류·SKU 로 돌려준다", async () => {
    mocks.series.findMany.mockResolvedValue([
      { id: BigInt(10), label: "春", kind: "event", sku: "EV-1" },
    ]);
    const out = await listCoverageSeries(7);
    expect(mocks.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: BigInt(7) } }),
    );
    expect(out).toEqual([{ id: 10, label: "春", kind: "event", sku: "EV-1" }]);
  });
});

describe("groupSeriesByKind", () => {
  it("종류를 DB 순서로, 묶음 안은 라벨순으로 정렬한다 — 목록에 없는 종류는 뒤로", () => {
    const groups = groupSeriesByKind(
      [
        { id: 1, label: "B", kind: "event", sku: "b" },
        { id: 2, label: "A", kind: "event", sku: "a" },
        { id: 3, label: "R", kind: "random", sku: "r" },
        { id: 4, label: "X", kind: "mystery", sku: "x" },
      ],
      KINDS,
    );
    expect(groups.map((g) => g.kind)).toEqual(["random", "event", "mystery"]);
    expect(groups[0].label).toBe("랜덤");
    expect(groups[1].series.map((s) => s.id)).toEqual([2, 1]);
    // 라벨을 모르는 종류는 키 그대로
    expect(groups[2].label).toBe("mystery");
  });
});

describe("buildCoverageMatrix", () => {
  const columns = groupSeriesByKind(
    [
      { id: 10, label: "봄", kind: "random", sku: "r1" },
      { id: 20, label: "여름", kind: "event", sku: "e1" },
    ],
    KINDS,
  );
  const members = [{ id: 1, name: "미유" }, { id: 2, name: "하나" }];

  it("멤버 × 시리즈 셀을 열 순서대로 채우고 합계·빈 셀 수를 계산한다", () => {
    const matrix = buildCoverageMatrix(members, columns, [
      { memberId: 1, seriesId: 10, count: 3 },
      { memberId: 2, seriesId: 20, count: 1 },
    ]);
    expect(matrix.rows).toEqual([
      { member: members[0], counts: [3, 0], total: 3 },
      { member: members[1], counts: [0, 1], total: 1 },
    ]);
    expect(matrix.columnTotals).toEqual([3, 1]);
    expect(matrix.emptyCells).toBe(2);
  });

  it("셀이 없으면 모두 0 — 빈 셀 수는 멤버 × 시리즈", () => {
    const matrix = buildCoverageMatrix(members, columns, []);
    expect(matrix.rows.every((r) => r.total === 0)).toBe(true);
    expect(matrix.emptyCells).toBe(4);
  });

  it("coverageKey 는 멤버·시리즈 id 쌍을 한 키로 만든다", () => {
    expect(coverageKey(1, 10)).toBe("1:10");
  });
});

describe("getTeamCoverage", () => {
  it("셀과 종류별 열을 한 번에 묶어 돌려준다", async () => {
    mocks.card.groupBy.mockResolvedValue([
      { memberId: BigInt(1), seriesId: BigInt(10), _count: { _all: 2 } },
    ]);
    mocks.series.findMany.mockResolvedValue([
      { id: BigInt(10), label: "봄", kind: "random", sku: "r1" },
    ]);
    const out = await getTeamCoverage(7, KINDS);
    expect(out.cells).toEqual([{ memberId: 1, seriesId: 10, count: 2 }]);
    expect(out.columns).toEqual([
      { kind: "random", label: "랜덤", series: [{ id: 10, label: "봄", kind: "random", sku: "r1" }] },
    ]);
  });
});
