import { describe, expect, it } from "vitest";

import {
  aggregateInventory,
  toCollectionCard,
  toInventoryEntry,
  type ActiveInventoryRow,
} from "@/modules/collection/lib/transform";

function row(
  o: Partial<ActiveInventoryRow> & { id: bigint; productId: bigint },
): ActiveInventoryRow {
  return {
    productName: "카드",
    productThumbnailKey: "k",
    itemType: "photocard",
    teamId: null,
    memberId: null,
    quantity: 1,
    acquiredAt: new Date("2026-07-01T00:00:00Z"),
    ...o,
  };
}

describe("aggregateInventory", () => {
  it("product별 quantity = SUM, acquiredAt = MIN", () => {
    const aggs = aggregateInventory([
      row({ id: 1n, productId: 5n, quantity: 2, acquiredAt: new Date("2026-07-02T00:00:00Z") }),
      row({ id: 2n, productId: 5n, quantity: 3, acquiredAt: new Date("2026-07-01T00:00:00Z") }),
    ]);
    expect(aggs.get(5n)?.quantity).toBe(5);
    expect(aggs.get(5n)?.acquiredAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("스냅샷은 최신 행(id 최대) 기준 — 입력 순서와 무관", () => {
    const newer = row({ id: 9n, productId: 5n, productName: "신버전", teamId: 2n });
    const older = row({ id: 3n, productId: 5n, productName: "구버전", teamId: 1n });
    for (const rows of [
      [older, newer],
      [newer, older],
    ]) {
      const agg = aggregateInventory(rows).get(5n);
      expect(agg?.productName).toBe("신버전");
      expect(agg?.teamId).toBe(2n);
    }
  });

  it("여러 product는 분리 집계", () => {
    const aggs = aggregateInventory([
      row({ id: 1n, productId: 5n, quantity: 2 }),
      row({ id: 2n, productId: 7n, quantity: 4 }),
    ]);
    expect(aggs.get(5n)?.quantity).toBe(2);
    expect(aggs.get(7n)?.quantity).toBe(4);
  });

  it("빈 입력은 빈 맵", () => {
    expect(aggregateInventory([]).size).toBe(0);
  });
});

describe("DTO 변환", () => {
  const agg = aggregateInventory([
    row({ id: 1n, productId: 5n, quantity: 2, teamId: 10n, memberId: null }),
  ]).get(5n);
  if (!agg) throw new Error("agg 없음");

  it("toInventoryEntry — BigInt→number, Date→ISO", () => {
    const entry = toInventoryEntry(agg);
    expect(entry).toMatchObject({
      productId: 5,
      teamId: 10,
      memberId: null,
      quantity: 2,
      acquiredAt: "2026-07-01T00:00:00.000Z",
    });
    expect(typeof entry.productId).toBe("number");
  });

  it("toCollectionCard — 등록 관계(id·sortOrder)와 도출값 결합", () => {
    const card = toCollectionCard({ id: 99n, productId: 5n, sortOrder: 3 }, agg);
    expect(card).toMatchObject({
      id: 99,
      productId: 5,
      sortOrder: 3,
      quantity: 2,
      acquiredAt: "2026-07-01T00:00:00.000Z",
    });
  });
});
