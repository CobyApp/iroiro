import { z } from "zod";

// 장바구니 수량 상한 — 중고 단품 특성상 넉넉하지만, 폭주 입력 방지용 상한.
export const MAX_CART_QUANTITY = 99;

export const cartItemAddSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(MAX_CART_QUANTITY),
});

export const cartItemUpdateSchema = z.object({
  cartItemId: z.number().int().positive(),
  quantity: z.number().int().positive().max(MAX_CART_QUANTITY),
});

export const cartItemRemoveSchema = z.object({
  cartItemId: z.number().int().positive(),
});

export type CartItemAddInput = z.infer<typeof cartItemAddSchema>;
export type CartItemUpdateInput = z.infer<typeof cartItemUpdateSchema>;
export type CartItemRemoveInput = z.infer<typeof cartItemRemoveSchema>;
