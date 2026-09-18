import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  materializeItems,
  reverseOrderItems,
  type MaterializeItem,
} from "@/modules/collection/lib/materialize";

// 상태유지 fake — 인메모리 보유 원장. createMany는 order_item_id UNIQUE(skipDuplicates)를,
// updateMany는 reversed_at IS NULL 필터를 시뮬. (표시 합계·활성 0 제외는 조회 계층(Task 8) 몫.)
type InventoryRow = {
  accountId: string;
  productId: bigint;
  orderItemId: bigint;
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  teamId: bigint | null;
  memberId: bigint | null;
  quantity: number;
  acquiredAt: Date;
  reversedAt: Date | null;
};

function makeFakeTx() {
  const inventory: InventoryRow[] = [];

  const tx = {
    inventoryItem: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Omit<InventoryRow, "reversedAt">[];
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const d of data) {
          if (skipDuplicates && inventory.some((s) => s.orderItemId === d.orderItemId))
            continue;
          inventory.push({ ...d, reversedAt: null });
          count += 1;
        }
        return { count };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { accountId: string; orderItemId: { in: bigint[] }; reversedAt: null };
        data: { reversedAt: Date };
      }) => {
        let count = 0;
        for (const s of inventory) {
          if (
            s.accountId === where.accountId &&
            where.orderItemId.in.includes(s.orderItemId) &&
            s.reversedAt === null
          ) {
            s.reversedAt = data.reversedAt;
            count += 1;
          }
        }
        return { count };
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, inventory };
}

function item(
  o: Partial<MaterializeItem> & { productId: bigint; orderItemId: bigint },
): MaterializeItem {
  return {
    quantity: 1,
    productName: "카드",
    productThumbnailKey: "k",
    itemType: "photocard",
    teamId: null,
    memberId: null,
    ...o,
  };
}

describe("materializeItems", () => {
  it("멱등 — 같은 order_item 재적재는 원장 중복 없음", async () => {
    const { tx, inventory } = makeFakeTx();
    const items = [item({ productId: 5n, orderItemId: 9n, quantity: 2 })];
    await materializeItems(tx, "acc", items, new Date("2026-07-14T00:00:00Z"));
    await materializeItems(tx, "acc", items, new Date("2026-07-15T00:00:00Z")); // 재처리
    expect(inventory).toHaveLength(1);
    expect(inventory[0].quantity).toBe(2);
  });

  it("스냅샷·수량·획득시각이 원장 행에 저장된다", async () => {
    const { tx, inventory } = makeFakeTx();
    const acquired = new Date("2026-07-14T00:00:00Z");
    await materializeItems(
      tx,
      "acc",
      [
        item({
          productId: 5n,
          orderItemId: 9n,
          quantity: 2,
          productName: "하니 포카",
          productThumbnailKey: "thumb/1",
          itemType: "photocard",
          teamId: 1n,
          memberId: 2n,
        }),
      ],
      acquired,
    );
    expect(inventory[0]).toMatchObject({
      accountId: "acc",
      productId: 5n,
      orderItemId: 9n,
      quantity: 2,
      productName: "하니 포카",
      productThumbnailKey: "thumb/1",
      teamId: 1n,
      memberId: 2n,
      acquiredAt: acquired,
      reversedAt: null,
    });
  });

  it("같은 상품을 다른 주문라인으로 사면 행이 축적된다(합산은 조회 계층 몫)", async () => {
    const { tx, inventory } = makeFakeTx();
    await materializeItems(
      tx,
      "acc",
      [
        item({ productId: 5n, orderItemId: 9n, quantity: 2 }),
        item({ productId: 5n, orderItemId: 10n, quantity: 3 }),
      ],
      new Date(),
    );
    expect(inventory.filter((s) => s.productId === 5n)).toHaveLength(2);
  });

  it("빈 목록은 no-op", async () => {
    const { tx, inventory } = makeFakeTx();
    await materializeItems(tx, "acc", [], new Date());
    expect(inventory).toHaveLength(0);
  });
});

describe("reverseOrderItems", () => {
  it("reversed_at 스탬프 — 행은 보존(감사), 삭제 없음", async () => {
    const { tx, inventory } = makeFakeTx();
    await materializeItems(
      tx,
      "acc",
      [item({ productId: 5n, orderItemId: 9n, quantity: 2 })],
      new Date("2026-07-14T00:00:00Z"),
    );
    await reverseOrderItems(tx, "acc", [9n]);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].reversedAt).not.toBeNull();
  });

  it("멱등 — 이미 reversed인 행은 재실행에도 스탬프가 바뀌지 않음", async () => {
    const { tx, inventory } = makeFakeTx();
    await materializeItems(
      tx,
      "acc",
      [item({ productId: 5n, orderItemId: 9n, quantity: 2 })],
      new Date(),
    );
    await reverseOrderItems(tx, "acc", [9n]);
    const first = inventory[0].reversedAt;
    await reverseOrderItems(tx, "acc", [9n]); // 재실행
    expect(inventory[0].reversedAt).toBe(first);
  });

  it("지정한 주문상품만 reverse — 다른 라인·다른 계정은 불변", async () => {
    const { tx, inventory } = makeFakeTx();
    await materializeItems(
      tx,
      "acc",
      [
        item({ productId: 5n, orderItemId: 9n, quantity: 2 }),
        item({ productId: 5n, orderItemId: 10n, quantity: 3 }),
      ],
      new Date(),
    );
    await materializeItems(
      tx,
      "other",
      [item({ productId: 5n, orderItemId: 11n, quantity: 1 })],
      new Date(),
    );
    await reverseOrderItems(tx, "acc", [9n]);
    expect(inventory.find((s) => s.orderItemId === 9n)?.reversedAt).not.toBeNull();
    expect(inventory.find((s) => s.orderItemId === 10n)?.reversedAt).toBeNull();
    expect(inventory.find((s) => s.orderItemId === 11n)?.reversedAt).toBeNull();
  });

  it("빈 배열은 no-op", async () => {
    const { tx, inventory } = makeFakeTx();
    await reverseOrderItems(tx, "acc", []);
    expect(inventory).toHaveLength(0);
  });
});
