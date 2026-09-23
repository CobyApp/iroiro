import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/lib/notify";

// 스토어 주문 자동 수령확정 — 발송(shipped) 후 이 기간이 지나면 구매자가 확정하지 않아도
// 자동으로 배송완료(delivered)로 전이한다(중고 안전거래와 같은 원칙·기간).
// 모든 전이는 조건부 updateMany 라 멱등·경합 안전. shipped_at 이 NULL 이면 자동확정 제외(안전).
export const ORDER_AUTO_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000; // 발송 후 7일
export const ORDER_AUTO_CONFIRM_DAYS = Math.round(
  ORDER_AUTO_CONFIRM_MS / (24 * 60 * 60 * 1000),
);

function cutoffFrom(now: Date): Date {
  return new Date(now.getTime() - ORDER_AUTO_CONFIRM_MS);
}

/**
 * 주문 하나를 자동 수령확정한다.
 *  - shipped + shipped_at 이 (now − ORDER_AUTO_CONFIRM_MS) 이전 → delivered
 * 전이했으면 true. shipped_at 이 NULL 이면 lte 비교에서 제외돼 자동확정되지 않는다.
 */
export async function autoConfirmOrderIfDue(
  orderId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = cutoffFrom(now);
  const order = await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: {
        id: BigInt(orderId),
        status: "shipped",
        shippedAt: { lte: cutoff },
      },
      data: { status: "delivered", updatedAt: now },
    });
    if (res.count === 0) return null;
    const row = await tx.order.findUniqueOrThrow({ where: { id: BigInt(orderId) } });
    await tx.orderStatusHistory.create({
      data: { orderId: row.id, status: "delivered", statusChangedAt: now },
    });
    return row;
  });
  if (!order) return false;
  await notify(order.accountId, {
    type: "order_delivered",
    title: "주문이 자동으로 구매확정됐어요",
    body: `발송 후 ${ORDER_AUTO_CONFIRM_DAYS}일이 지나 배송완료 처리됐어요. 도착 인증 리뷰를 남겨보세요.`,
    link: `/orders/${order.orderNo}`,
  });
  return true;
}

/**
 * 기한 지난 발송 주문 일괄 스윕 — cron·주문내역 진입 시. 처리 건수 반환.
 * 같은 now 로 커트오프를 고정해 멱등.
 */
export async function autoConfirmDueOrders(limit = 100): Promise<number> {
  const now = new Date();
  const cutoff = cutoffFrom(now);
  const orders = await db.order.findMany({
    where: { status: "shipped", shippedAt: { lte: cutoff } },
    select: { id: true },
    take: limit,
  });
  let confirmed = 0;
  for (const { id } of orders) {
    if (await autoConfirmOrderIfDue(Number(id), now)) confirmed += 1;
  }
  return confirmed;
}
