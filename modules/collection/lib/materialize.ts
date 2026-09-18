import "server-only";

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type MaterializeItem = {
  productId: bigint;
  orderItemId: bigint;
  quantity: number;
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  teamId: bigint | null;
  memberId: bigint | null;
};

// 결제완료 주문의 아이템을 보유 원장(inventory_item)에 멱등 적재한다. paid tx 안에서 호출.
// 멱등: order_item_id UNIQUE + createMany(skipDuplicates) — 재실행돼도 결과 동일(락 불필요).
// 컬렉션은 건드리지 않는다: 등록(collection_item)은 유저 액션이고, 표시 수량·획득일·스냅샷은
// 조회 시 활성(reversed_at IS NULL) 원장에서 도출된다(저장 정합 없음).
export async function materializeItems(
  tx: Tx,
  accountId: string,
  items: MaterializeItem[],
  acquiredAt: Date,
): Promise<void> {
  if (items.length === 0) return;

  await tx.inventoryItem.createMany({
    data: items.map((i) => ({
      accountId,
      productId: i.productId,
      orderItemId: i.orderItemId,
      productName: i.productName,
      productThumbnailKey: i.productThumbnailKey,
      itemType: i.itemType,
      teamId: i.teamId,
      memberId: i.memberId,
      quantity: i.quantity,
      acquiredAt,
    })),
    skipDuplicates: true,
  });
}

// 주문상품들의 보유 기여분을 reverse한다(reversed_at 스탬프, 행은 보존 — 감사).
// 주문→order_item id 도출은 호출자(orders 도메인)의 몫. 이미 reversed인 행은 필터로
// 제외되어 재실행에 멱등. 등록 항목 정리는 불필요 — 활성 0인 등록은 조회에서 제외되고
// 재구매 시 자동 복원된다. 현재 호출처 없음(paid→canceled 미존재 — 향후 환불 플로우용).
export async function reverseOrderItems(
  tx: Tx,
  accountId: string,
  orderItemIds: bigint[],
): Promise<void> {
  if (orderItemIds.length === 0) return;

  await tx.inventoryItem.updateMany({
    where: { accountId, orderItemId: { in: orderItemIds }, reversedAt: null },
    data: { reversedAt: new Date(), updatedAt: new Date() },
  });
}
