import "server-only";

import { db as defaultDb } from "@/lib/db";
import type { InventoryEntry, OwnerCollection, PublicCollection } from "../types";
import {
  aggregateInventory,
  toCollectionCard,
  toInventoryEntry,
  type ActiveInventoryRow,
  type InventoryAggregate,
} from "./transform";

type Db = Pick<typeof defaultDb, "collection" | "collectionItem" | "inventoryItem">;

// 원장에서 활성 행만, 집계·스냅샷 필드만 선택한다 — order_item_id 등 원시 참조 비선택
// (공개 DTO 격리, 스펙 §공개 읽기 경로). 집계·정렬은 앱에서(계정당 활성 행 소량).
async function fetchActiveAggregates(
  db: Db,
  accountId: string,
  productIds?: bigint[],
): Promise<Map<bigint, InventoryAggregate>> {
  const rows: ActiveInventoryRow[] = await db.inventoryItem.findMany({
    where: {
      accountId,
      reversedAt: null,
      ...(productIds ? { productId: { in: productIds } } : {}),
    },
    select: {
      id: true,
      productId: true,
      productName: true,
      productThumbnailKey: true,
      itemType: true,
      teamId: true,
      memberId: true,
      quantity: true,
      acquiredAt: true,
    },
  });
  return aggregateInventory(rows);
}

function bySortOrderThenId(
  a: { sortOrder: number; id: bigint },
  b: { sortOrder: number; id: bigint },
): number {
  return a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// 등록 관계에 원장 도출값을 결합해 카드로 변환. 활성 0(도출 없음) 등록은 제외 —
// 행은 유지되므로 재구매 시 자동 복원(스펙 §라이프사이클).
function toCards(
  items: { id: bigint; productId: bigint; sortOrder: number }[],
  aggregates: Map<bigint, InventoryAggregate>,
): CollectionCardList {
  return [...items].sort(bySortOrderThenId).flatMap((item) => {
    const agg = aggregates.get(item.productId);
    return agg ? [toCollectionCard(item, agg)] : [];
  });
}
type CollectionCardList = PublicCollection["cards"];

// 공개 컬렉션 조회 — 비공개·미존재 모두 null(동일 404, 존재 여부 비노출).
// 주문·PII 테이블(order/payment/account) 미접근. account_id는 서버 내부에서만 쓰고 DTO 미포함.
export async function getPublicCollection(
  publicCode: string,
  db: Db = defaultDb,
): Promise<PublicCollection | null> {
  const collection = await db.collection.findFirst({
    where: { publicCode, isPublic: true },
    select: { id: true, accountId: true, title: true },
  });
  if (!collection) return null;

  const items = await db.collectionItem.findMany({
    where: { collectionId: collection.id },
    select: { id: true, productId: true, sortOrder: true },
  });
  const aggregates = await fetchActiveAggregates(
    db,
    collection.accountId,
    items.map((i) => i.productId),
  );
  return { title: collection.title, cards: toCards(items, aggregates) };
}

// 소유자 컬렉션 목록(카드 포함) — 노출 순번 정렬, 활성 0 등록 제외.
export async function getOwnerCollections(
  accountId: string,
  db: Db = defaultDb,
): Promise<OwnerCollection[]> {
  const collections = await db.collection.findMany({
    where: { accountId },
    select: {
      id: true,
      publicCode: true,
      title: true,
      isPublic: true,
      sortOrder: true,
    },
  });
  if (collections.length === 0) return [];

  const items = await db.collectionItem.findMany({
    where: { collectionId: { in: collections.map((c) => c.id) } },
    select: { id: true, collectionId: true, productId: true, sortOrder: true },
  });
  const aggregates = await fetchActiveAggregates(db, accountId);

  return [...collections].sort(bySortOrderThenId).map((collection) => ({
    id: Number(collection.id),
    publicCode: collection.publicCode,
    title: collection.title,
    isPublic: collection.isPublic,
    sortOrder: collection.sortOrder,
    cards: toCards(
      items.filter((i) => i.collectionId === collection.id),
      aggregates,
    ),
  }));
}

// 보유 목록(인벤토리 피커) — 소유자 전용, 최근 획득 순(동순위는 productId).
export async function getInventory(
  accountId: string,
  db: Db = defaultDb,
): Promise<InventoryEntry[]> {
  const aggregates = await fetchActiveAggregates(db, accountId);
  return [...aggregates.values()]
    .sort(
      (a, b) =>
        b.acquiredAt.getTime() - a.acquiredAt.getTime() ||
        (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0),
    )
    .map(toInventoryEntry);
}
