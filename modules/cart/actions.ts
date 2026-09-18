"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, DomainError, parseActionInput, runAction } from "@/lib/action-result";
import { db } from "@/lib/db";
import { isNotFoundError } from "@/lib/prisma-errors";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  cartItemAddSchema,
  cartItemRemoveSchema,
  cartItemUpdateSchema,
  type CartItemAddInput,
  type CartItemRemoveInput,
  type CartItemUpdateInput,
} from "./lib/schema";

// 소유권 경계 — 모든 장바구니 mutation의 첫 단계. 신원은 서버 세션에서만(클라이언트 신뢰 X).
async function requireAccountId(): Promise<string> {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account.id;
}

function revalidateCart(): void {
  revalidatePath("/cart");
}

// 사전 조회~최종 write 사이에 다른 요청이 삭제하면(TOCTOU) update/delete가 P2025를 던진다 —
// not-found 예상 도메인 오류로 결과화(사전 조회 실패 메시지와 동일).
async function mapCartWriteError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new DomainError("장바구니 항목을 찾을 수 없습니다");
    }
    throw error;
  }
}

export async function addCartItem(
  input: CartItemAddInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(cartItemAddSchema, input);
    const accountId = await requireAccountId();

    const product = await db.product.findUnique({
      where: { id: BigInt(data.productId) },
      select: {
        stockQuantity: true,
        saleStatus: true,
        saleMode: true,
        auctionStatus: true,
        auctionWinnerAccountId: true,
        auctionPayDueAt: true,
      },
    });
    if (!product || product.saleStatus !== "active") {
      throw new DomainError("판매 중인 상품이 아닙니다");
    }

    // 경매 상품은 낙찰자 전용 구매권 — 낙찰 상태 + 본인 + 결제 기한 내에만 담기 허용.
    if (product.saleMode === "auction") {
      const isWinnerWindow =
        product.auctionStatus === "awarded" &&
        product.auctionWinnerAccountId === accountId &&
        product.auctionPayDueAt !== null &&
        product.auctionPayDueAt.getTime() > Date.now();
      if (!isWinnerWindow) {
        throw new DomainError("경매 상품은 낙찰자만 기한 내에 구매할 수 있습니다");
      }
      if (data.quantity !== 1) {
        throw new DomainError("경매 상품은 1개만 구매할 수 있습니다");
      }
    }

    const existing = await db.cartItem.findUnique({
      where: {
        accountId_productId: {
          accountId,
          productId: BigInt(data.productId),
        },
      },
      select: { quantity: true },
    });
    const nextQuantity = (existing?.quantity ?? 0) + data.quantity;
    if (nextQuantity > product.stockQuantity) {
      throw new DomainError("재고가 부족합니다");
    }

    await db.cartItem.upsert({
      where: {
        accountId_productId: {
          accountId,
          productId: BigInt(data.productId),
        },
      },
      create: {
        accountId,
        productId: BigInt(data.productId),
        quantity: data.quantity,
      },
      update: { quantity: nextQuantity, updatedAt: new Date() },
    });
    revalidateCart();
  });
}

export async function updateCartItemQuantity(
  input: CartItemUpdateInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(cartItemUpdateSchema, input);
    const accountId = await requireAccountId();

    const item = await db.cartItem.findUnique({
      where: { id: BigInt(data.cartItemId) },
    });
    if (!item || item.accountId !== accountId) {
      throw new DomainError("장바구니 항목을 찾을 수 없습니다");
    }
    const product = await db.product.findUnique({
      where: { id: item.productId },
      select: { stockQuantity: true, saleMode: true },
    });
    if (product && data.quantity > product.stockQuantity) {
      throw new DomainError("재고가 부족합니다");
    }
    if (product?.saleMode === "auction" && data.quantity !== 1) {
      throw new DomainError("경매 상품은 1개만 구매할 수 있습니다");
    }

    await mapCartWriteError(() =>
      db.cartItem.update({
        where: { id: BigInt(data.cartItemId) },
        data: { quantity: data.quantity, updatedAt: new Date() },
      }),
    );
    revalidateCart();
  });
}

export async function removeCartItem(
  input: CartItemRemoveInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(cartItemRemoveSchema, input);
    const accountId = await requireAccountId();

    const item = await db.cartItem.findUnique({
      where: { id: BigInt(data.cartItemId) },
    });
    if (!item || item.accountId !== accountId) {
      throw new DomainError("장바구니 항목을 찾을 수 없습니다");
    }
    await mapCartWriteError(() =>
      db.cartItem.delete({ where: { id: BigInt(data.cartItemId) } }),
    );
    revalidateCart();
  });
}
