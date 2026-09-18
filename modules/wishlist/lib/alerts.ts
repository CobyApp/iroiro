import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/lib/notify";
import { detectWishlistEvents, type WishAlertSnapshot, type WishlistEvent } from "./alert-rules";

export type { WishAlertSnapshot, WishlistEvent };
export { detectWishlistEvents };

/**
 * 찜한 사람들에게 상품 변화 알림 — 관리자 수정 후(커밋 뒤) 호출, 실패해도 무시.
 * notify 내부가 인앱 + 웹 푸시를 함께 처리한다.
 */
export async function notifyWishers(
  productId: number,
  events: WishlistEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const wishers = await db.wishlist.findMany({
    where: { productId: BigInt(productId) },
    select: { accountId: true },
  });
  if (wishers.length === 0) return;

  for (const event of events) {
    for (const wisher of wishers) {
      await notify(wisher.accountId, {
        type: "wish_alert",
        title: event.title,
        body: event.body,
        link: `/products/${productId}`,
      });
    }
  }
}
