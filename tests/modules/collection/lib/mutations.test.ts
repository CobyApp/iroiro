import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/public-code", () => ({
  generatePublicCode: vi.fn(() => "fresh-code"),
}));

import { generatePublicCode } from "@/lib/public-code";
import * as mutations from "@/modules/collection/lib/mutations";

// where 조건·유니크 제약(P2002)을 실제로 적용하는 인메모리 fake db.
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
  accountId: string;
  productId: bigint;
  quantity: number;
  reversedAt: Date | null;
};

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("unique 위반", {
    code: "P2002",
    clientVersion: "7",
  });
}

function makeDb(seed?: {
  collections?: CollectionRow[];
  items?: ItemRow[];
  inventory?: InventoryRow[];
}) {
  const collections = seed?.collections ?? [];
  const items = seed?.items ?? [];
  const inventory = seed?.inventory ?? [];
  let nextId = 100n;

  const db = {
    collection: {
      findFirst: async ({ where }: { where: { id: bigint; accountId: string } }) =>
        collections.find((c) => c.id === where.id && c.accountId === where.accountId) ??
        null,
      aggregate: async ({ where }: { where: { accountId: string } }) => {
        const mine = collections.filter((c) => c.accountId === where.accountId);
        return {
          _max: { sortOrder: mine.length ? Math.max(...mine.map((c) => c.sortOrder)) : null },
        };
      },
      create: async ({
        data,
      }: {
        data: { accountId: string; publicCode: string; title: string; sortOrder: number };
      }) => {
        if (collections.some((c) => c.publicCode === data.publicCode)) throw p2002();
        const row: CollectionRow = { id: nextId++, isPublic: false, ...data };
        collections.push(row);
        return { id: row.id, publicCode: row.publicCode };
      },
      deleteMany: async ({ where }: { where: { id: bigint; accountId: string } }) => {
        const before = collections.length;
        for (let i = collections.length - 1; i >= 0; i--) {
          if (collections[i].id === where.id && collections[i].accountId === where.accountId)
            collections.splice(i, 1);
        }
        return { count: before - collections.length };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: bigint; accountId: string };
        data: Partial<CollectionRow>;
      }) => {
        let count = 0;
        for (const c of collections) {
          if (c.id === where.id && c.accountId === where.accountId) {
            Object.assign(c, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    collectionItem: {
      aggregate: async ({ where }: { where: { collectionId: bigint } }) => {
        const mine = items.filter((i) => i.collectionId === where.collectionId);
        return {
          _max: { sortOrder: mine.length ? Math.max(...mine.map((i) => i.sortOrder)) : null },
        };
      },
      create: async ({
        data,
      }: {
        data: { collectionId: bigint; productId: bigint; sortOrder: number };
      }) => {
        if (
          items.some(
            (i) => i.collectionId === data.collectionId && i.productId === data.productId,
          )
        )
          throw p2002();
        const row: ItemRow = { id: nextId++, ...data };
        items.push(row);
        return row;
      },
      deleteMany: async ({
        where,
      }: {
        where: { collectionId: bigint; productId?: bigint };
      }) => {
        const before = items.length;
        for (let i = items.length - 1; i >= 0; i--) {
          if (
            items[i].collectionId === where.collectionId &&
            (where.productId === undefined || items[i].productId === where.productId)
          )
            items.splice(i, 1);
        }
        return { count: before - items.length };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { collectionId: bigint; productId: bigint };
        data: { sortOrder: number };
      }) => {
        let count = 0;
        for (const i of items) {
          if (i.collectionId === where.collectionId && i.productId === where.productId) {
            i.sortOrder = data.sortOrder;
            count += 1;
          }
        }
        return { count };
      },
    },
    inventoryItem: {
      aggregate: async ({
        where,
      }: {
        where: { accountId: string; productId: bigint; reversedAt: null };
      }) => {
        const active = inventory.filter(
          (r) =>
            r.accountId === where.accountId &&
            r.productId === where.productId &&
            r.reversedAt === null,
        );
        return {
          _sum: {
            quantity: active.length ? active.reduce((s, r) => s + r.quantity, 0) : null,
          },
        };
      },
    },
    $transaction: async <T>(cb: (tx: unknown) => Promise<T>) => cb(db),
  };
  return { db, collections, items };
}

const col = (o: Partial<CollectionRow> & { id: bigint }): CollectionRow => ({
  accountId: "acc",
  publicCode: `code-${o.id}`,
  title: "내 컬렉션",
  isPublic: false,
  sortOrder: 1,
  ...o,
});

beforeEach(() => {
  vi.mocked(generatePublicCode).mockReset().mockReturnValue("fresh-code");
});

describe("createCollection", () => {
  it("첫 컬렉션은 sortOrder 1, 이후 MAX+1", async () => {
    const { db, collections } = makeDb();
    await mutations.createCollection("acc", "가을", db as never);
    expect(collections[0].sortOrder).toBe(1);

    vi.mocked(generatePublicCode).mockReturnValue("another-code");
    await mutations.createCollection("acc", "겨울", db as never);
    expect(collections[1].sortOrder).toBe(2);
  });

  it("public_code 충돌(P2002) 시 재생성 후 성공", async () => {
    const { db, collections } = makeDb({
      collections: [col({ id: 1n, publicCode: "dup" })],
    });
    vi.mocked(generatePublicCode)
      .mockReturnValueOnce("dup")
      .mockReturnValueOnce("fresh-code");
    const created = await mutations.createCollection("acc", "가을", db as never);
    expect(created.publicCode).toBe("fresh-code");
    expect(collections).toHaveLength(2);
  });
});

describe("deleteCollection", () => {
  it("소유 컬렉션 삭제 시 등록 항목도 함께 삭제(cascade)", async () => {
    const { db, collections, items } = makeDb({
      collections: [col({ id: 1n }), col({ id: 2n })],
      items: [
        { id: 10n, collectionId: 1n, productId: 5n, sortOrder: 1 },
        { id: 11n, collectionId: 2n, productId: 5n, sortOrder: 1 },
      ],
    });
    await mutations.deleteCollection("acc", 1, db as never);
    expect(collections.map((c) => c.id)).toEqual([2n]);
    expect(items.map((i) => i.collectionId)).toEqual([2n]); // 다른 컬렉션 등록은 유지
  });

  it("타인 소유·미존재는 동일 에러, 아무것도 삭제하지 않음", async () => {
    const { db, collections } = makeDb({
      collections: [col({ id: 1n, accountId: "other" })],
    });
    await expect(mutations.deleteCollection("acc", 1, db as never)).rejects.toThrow(
      "컬렉션을 찾을 수 없습니다",
    );
    expect(collections).toHaveLength(1);
  });
});

describe("registerItem", () => {
  it("활성 보유 검증 후 sortOrder = 컬렉션 내 MAX+1로 등록", async () => {
    const { db, items } = makeDb({
      collections: [col({ id: 1n })],
      items: [{ id: 10n, collectionId: 1n, productId: 3n, sortOrder: 4 }],
      inventory: [{ accountId: "acc", productId: 5n, quantity: 2, reversedAt: null }],
    });
    const result = await mutations.registerItem("acc", 1, 5, db as never);
    expect(result.publicCode).toBe("code-1");
    expect(items.find((i) => i.productId === 5n)?.sortOrder).toBe(5);
  });

  it("활성 보유 0(전량 reversed)이면 거절", async () => {
    const { db } = makeDb({
      collections: [col({ id: 1n })],
      inventory: [
        { accountId: "acc", productId: 5n, quantity: 2, reversedAt: new Date() },
      ],
    });
    await expect(mutations.registerItem("acc", 1, 5, db as never)).rejects.toThrow(
      "보유하지 않은 상품입니다",
    );
  });

  it("중복 등록은 도메인 에러", async () => {
    const { db } = makeDb({
      collections: [col({ id: 1n })],
      items: [{ id: 10n, collectionId: 1n, productId: 5n, sortOrder: 1 }],
      inventory: [{ accountId: "acc", productId: 5n, quantity: 1, reversedAt: null }],
    });
    await expect(mutations.registerItem("acc", 1, 5, db as never)).rejects.toThrow(
      "이미 등록된 상품입니다",
    );
  });

  it("타인 컬렉션에는 등록 불가", async () => {
    const { db } = makeDb({
      collections: [col({ id: 1n, accountId: "other" })],
      inventory: [{ accountId: "acc", productId: 5n, quantity: 1, reversedAt: null }],
    });
    await expect(mutations.registerItem("acc", 1, 5, db as never)).rejects.toThrow(
      "컬렉션을 찾을 수 없습니다",
    );
  });
});

describe("unregisterItem", () => {
  it("등록 해제 — 행 삭제", async () => {
    const { db, items } = makeDb({
      collections: [col({ id: 1n })],
      items: [{ id: 10n, collectionId: 1n, productId: 5n, sortOrder: 1 }],
    });
    await mutations.unregisterItem("acc", 1, 5, db as never);
    expect(items).toHaveLength(0);
  });

  it("등록이 없으면 에러", async () => {
    const { db } = makeDb({ collections: [col({ id: 1n })] });
    await expect(mutations.unregisterItem("acc", 1, 5, db as never)).rejects.toThrow(
      "등록된 상품이 없습니다",
    );
  });
});

describe("reorderItems", () => {
  it("배열 순서대로 1..N 재부여, 미포함 등록은 기존 순번 유지", async () => {
    const { db, items } = makeDb({
      collections: [col({ id: 1n })],
      items: [
        { id: 10n, collectionId: 1n, productId: 5n, sortOrder: 1 },
        { id: 11n, collectionId: 1n, productId: 7n, sortOrder: 2 },
        { id: 12n, collectionId: 1n, productId: 9n, sortOrder: 3 },
      ],
    });
    await mutations.reorderItems("acc", 1, [7, 5], db as never);
    expect(items.find((i) => i.productId === 7n)?.sortOrder).toBe(1);
    expect(items.find((i) => i.productId === 5n)?.sortOrder).toBe(2);
    expect(items.find((i) => i.productId === 9n)?.sortOrder).toBe(3); // 유지
  });
});

describe("setCollectionPublic / setCollectionTitle", () => {
  it("소유 스코프에서 공개 토글·이름 변경, publicCode 반환", async () => {
    const { db, collections } = makeDb({ collections: [col({ id: 1n })] });
    const pub = await mutations.setCollectionPublic("acc", 1, true, db as never);
    expect(pub.publicCode).toBe("code-1");
    expect(collections[0].isPublic).toBe(true);

    await mutations.setCollectionTitle("acc", 1, "최애 모음", db as never);
    expect(collections[0].title).toBe("최애 모음");
  });
});
