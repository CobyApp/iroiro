import { describe, expect, it } from "vitest";

import {
  getInventory,
  getOwnerCollections,
  getPublicCollection,
} from "@/modules/collection/lib/queries";

// where 조건을 실제로 적용하는 인메모리 fake db — 격리(계정 스코프·활성 필터)와
// 원장 select 필드(원시 참조 비선택)를 검증한다.
type CollectionRow = {
  id: bigint;
  accountId: string;
  publicCode: string;
  title: string;
  isPublic: boolean;
  sortOrder: number;
};
type ItemRow = { id: bigint; collectionId: bigint; productId: bigint; sortOrder: number };
type InventoryRow = {
  id: bigint;
  accountId: string;
  productId: bigint;
  orderItemId: bigint; // fake 행엔 존재 — select에 포함되면 안 되는 필드
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  teamId: bigint | null;
  memberId: bigint | null;
  quantity: number;
  acquiredAt: Date;
  reversedAt: Date | null;
};

function makeDb(seed: {
  collections?: CollectionRow[];
  items?: ItemRow[];
  inventory?: InventoryRow[];
}) {
  const collections = seed.collections ?? [];
  const items = seed.items ?? [];
  const inventory = seed.inventory ?? [];
  const inventorySelects: object[] = [];

  const db = {
    collection: {
      findFirst: async ({
        where,
      }: {
        where: { publicCode: string; isPublic: boolean };
      }) =>
        collections.find(
          (c) => c.publicCode === where.publicCode && c.isPublic === where.isPublic,
        ) ?? null,
      findMany: async ({ where }: { where: { accountId: string } }) =>
        collections.filter((c) => c.accountId === where.accountId),
    },
    collectionItem: {
      findMany: async ({
        where,
      }: {
        where: { collectionId: bigint | { in: bigint[] } };
      }) =>
        items.filter((i) =>
          typeof where.collectionId === "bigint"
            ? i.collectionId === where.collectionId
            : where.collectionId.in.includes(i.collectionId),
        ),
    },
    inventoryItem: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          accountId: string;
          reversedAt: null;
          productId?: { in: bigint[] };
        };
        select: Record<string, boolean>;
      }) => {
        inventorySelects.push(select);
        return inventory
          .filter(
            (r) =>
              r.accountId === where.accountId &&
              r.reversedAt === null &&
              (!where.productId || where.productId.in.includes(r.productId)),
          )
          .map((r) => ({
            id: r.id,
            productId: r.productId,
            productName: r.productName,
            productThumbnailKey: r.productThumbnailKey,
            itemType: r.itemType,
            teamId: r.teamId,
            memberId: r.memberId,
            quantity: r.quantity,
            acquiredAt: r.acquiredAt,
          }));
      },
    },
  };
  return { db, inventorySelects };
}

const col = (o: Partial<CollectionRow> & { id: bigint }): CollectionRow => ({
  accountId: "acc",
  publicCode: `code-${o.id}`,
  title: "내 컬렉션",
  isPublic: true,
  sortOrder: 1,
  ...o,
});
const item = (o: Partial<ItemRow> & { id: bigint; collectionId: bigint; productId: bigint }): ItemRow => ({
  sortOrder: 1,
  ...o,
});
const inv = (o: Partial<InventoryRow> & { id: bigint; productId: bigint }): InventoryRow => ({
  accountId: "acc",
  orderItemId: o.id,
  productName: "카드",
  productThumbnailKey: "k",
  itemType: "photocard",
  teamId: null,
  memberId: null,
  quantity: 1,
  acquiredAt: new Date("2026-07-01T00:00:00Z"),
  reversedAt: null,
  ...o,
});

describe("getPublicCollection", () => {
  it("미존재·비공개 코드는 동일하게 null", async () => {
    const { db } = makeDb({
      collections: [col({ id: 1n, publicCode: "secret", isPublic: false })],
    });
    expect(await getPublicCollection("none", db as never)).toBeNull();
    expect(await getPublicCollection("secret", db as never)).toBeNull();
  });

  it("등록 카드에 도출값(합계·최초획득) 결합, sortOrder 정렬, 활성 0 제외", async () => {
    const { db } = makeDb({
      collections: [col({ id: 1n, publicCode: "pub" })],
      items: [
        item({ id: 11n, collectionId: 1n, productId: 7n, sortOrder: 2 }),
        item({ id: 10n, collectionId: 1n, productId: 5n, sortOrder: 1 }),
        item({ id: 12n, collectionId: 1n, productId: 9n, sortOrder: 3 }), // 전량 reversed
      ],
      inventory: [
        inv({ id: 1n, productId: 5n, quantity: 2 }),
        inv({ id: 2n, productId: 5n, quantity: 3, acquiredAt: new Date("2026-07-02T00:00:00Z") }),
        inv({ id: 3n, productId: 7n, quantity: 1 }),
        inv({ id: 4n, productId: 9n, quantity: 1, reversedAt: new Date() }),
      ],
    });
    const result = await getPublicCollection("pub", db as never);
    expect(result?.title).toBe("내 컬렉션");
    expect(result?.cards.map((c) => c.productId)).toEqual([5, 7]); // 정렬 + 활성 0(9) 제외
    expect(result?.cards[0]).toMatchObject({
      quantity: 5,
      acquiredAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("격리 — 원장 select에 orderItemId·accountId 비포함, DTO에 내부 식별자 누출 없음", async () => {
    const { db, inventorySelects } = makeDb({
      collections: [col({ id: 1n, publicCode: "pub" })],
      items: [item({ id: 10n, collectionId: 1n, productId: 5n })],
      inventory: [inv({ id: 1n, productId: 5n })],
    });
    const result = await getPublicCollection("pub", db as never);
    for (const select of inventorySelects) {
      expect(select).not.toHaveProperty("orderItemId");
      expect(select).not.toHaveProperty("accountId");
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("accountId");
    expect(serialized).not.toContain("orderItemId");
  });
});

describe("getOwnerCollections", () => {
  it("컬렉션·카드 모두 sortOrder 정렬, 빈 컬렉션은 cards []", async () => {
    const { db } = makeDb({
      collections: [
        col({ id: 2n, publicCode: "b", sortOrder: 2, isPublic: false }),
        col({ id: 1n, publicCode: "a", sortOrder: 1 }),
      ],
      items: [
        item({ id: 11n, collectionId: 1n, productId: 7n, sortOrder: 2 }),
        item({ id: 10n, collectionId: 1n, productId: 5n, sortOrder: 1 }),
      ],
      inventory: [
        inv({ id: 1n, productId: 5n }),
        inv({ id: 2n, productId: 7n }),
      ],
    });
    const result = await getOwnerCollections("acc", db as never);
    expect(result.map((c) => c.publicCode)).toEqual(["a", "b"]);
    expect(result[0].cards.map((c) => c.productId)).toEqual([5, 7]);
    expect(result[1].cards).toEqual([]);
    expect(result[0]).toMatchObject({ id: 1, isPublic: true, sortOrder: 1 });
  });

  it("컬렉션이 없으면 빈 배열", async () => {
    const { db } = makeDb({});
    expect(await getOwnerCollections("acc", db as never)).toEqual([]);
  });
});

describe("getInventory", () => {
  it("product별 집계 + 최근 획득 순 정렬, 타 계정·reversed 행 제외", async () => {
    const { db } = makeDb({
      inventory: [
        inv({ id: 1n, productId: 5n, quantity: 2, acquiredAt: new Date("2026-07-01T00:00:00Z") }),
        inv({ id: 2n, productId: 5n, quantity: 1, acquiredAt: new Date("2026-07-03T00:00:00Z") }),
        inv({ id: 3n, productId: 7n, quantity: 1, acquiredAt: new Date("2026-07-02T00:00:00Z") }),
        inv({ id: 4n, productId: 8n, quantity: 9, accountId: "other" }),
        inv({ id: 5n, productId: 9n, quantity: 1, reversedAt: new Date() }),
      ],
    });
    const result = await getInventory("acc", db as never);
    // p5: MIN 획득 07-01, p7: 07-02 → 최근 획득 순은 p7이 아니라... 정렬 키는 MIN(acquiredAt)
    expect(result.map((e) => e.productId)).toEqual([7, 5]);
    expect(result.find((e) => e.productId === 5)?.quantity).toBe(3);
    expect(result.some((e) => e.productId === 8 || e.productId === 9)).toBe(false);
  });
});
