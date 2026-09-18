import "server-only";

import type { CartItem as PrismaCartItem } from "@prisma/client";
import type { CartItem } from "../types";

export function toCartItem(row: PrismaCartItem): CartItem {
  return {
    id: Number(row.id),
    accountId: row.accountId,
    productId: Number(row.productId),
    quantity: row.quantity,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
