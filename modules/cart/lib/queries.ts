import "server-only";

import { db } from "@/lib/db";
import { toCartItem } from "./transform";
import type { CartItem } from "../types";

/**
 * 회원의 장바구니 항목(원본, 최신순). 상품 스냅샷은 붙이지 않는다 — 호출 측(/cart 페이지)에서
 * products 도메인을 함께 호출해 합성한다(도메인 간 lib 결합 금지 룰).
 */
export async function getCartItems(accountId: string): Promise<CartItem[]> {
  const rows = await db.cartItem.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toCartItem);
}

/** 헤더 뱃지용 — 장바구니에 담긴 상품 종류 수(행 수). */
export async function getCartCount(accountId: string): Promise<number> {
  return db.cartItem.count({ where: { accountId } });
}
