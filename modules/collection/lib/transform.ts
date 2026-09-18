import type { CollectionCard, InventoryEntry } from "../types";

// 원장 활성 행(도출 조회 입력)의 최소 형태 — queries의 Prisma select와 일치.
// order_item_id 등 원시 참조는 여기 없음(공개 DTO 격리의 타입 레벨 반영).
export type ActiveInventoryRow = {
  id: bigint;
  productId: bigint;
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  teamId: bigint | null;
  memberId: bigint | null;
  quantity: number;
  acquiredAt: Date;
};

// product별 도출값: quantity = SUM(활성), acquiredAt = MIN(활성), 스냅샷 = 최신 활성 행 기준.
export type InventoryAggregate = Omit<ActiveInventoryRow, "id">;

// 활성 원장 행들을 product별로 접는다. 입력 순서와 무관하게 결정적(스냅샷은 id 최대 행).
export function aggregateInventory(
  rows: ActiveInventoryRow[],
): Map<bigint, InventoryAggregate> {
  const byProduct = new Map<bigint, { latestId: bigint; agg: InventoryAggregate }>();
  for (const row of rows) {
    const cur = byProduct.get(row.productId);
    if (!cur) {
      byProduct.set(row.productId, {
        latestId: row.id,
        agg: {
          productId: row.productId,
          productName: row.productName,
          productThumbnailKey: row.productThumbnailKey,
          itemType: row.itemType,
          teamId: row.teamId,
          memberId: row.memberId,
          quantity: row.quantity,
          acquiredAt: row.acquiredAt,
        },
      });
      continue;
    }
    cur.agg.quantity += row.quantity;
    if (row.acquiredAt < cur.agg.acquiredAt) cur.agg.acquiredAt = row.acquiredAt;
    if (row.id > cur.latestId) {
      cur.latestId = row.id;
      cur.agg.productName = row.productName;
      cur.agg.productThumbnailKey = row.productThumbnailKey;
      cur.agg.itemType = row.itemType;
      cur.agg.teamId = row.teamId;
      cur.agg.memberId = row.memberId;
    }
  }
  return new Map([...byProduct].map(([productId, v]) => [productId, v.agg]));
}

function toNullableNumber(v: bigint | null): number | null {
  return v == null ? null : Number(v);
}

export function toInventoryEntry(agg: InventoryAggregate): InventoryEntry {
  return {
    productId: Number(agg.productId),
    productName: agg.productName,
    productThumbnailKey: agg.productThumbnailKey,
    itemType: agg.itemType,
    teamId: toNullableNumber(agg.teamId),
    memberId: toNullableNumber(agg.memberId),
    quantity: agg.quantity,
    acquiredAt: agg.acquiredAt.toISOString(),
  };
}

export function toCollectionCard(
  item: { id: bigint; productId: bigint; sortOrder: number },
  agg: InventoryAggregate,
): CollectionCard {
  return {
    id: Number(item.id),
    productId: Number(item.productId),
    productName: agg.productName,
    productThumbnailKey: agg.productThumbnailKey,
    itemType: agg.itemType,
    teamId: toNullableNumber(agg.teamId),
    memberId: toNullableNumber(agg.memberId),
    quantity: agg.quantity,
    sortOrder: item.sortOrder,
    acquiredAt: agg.acquiredAt.toISOString(),
  };
}
