import { describe, expect, it } from "vitest";
import type { CartItem as PrismaCartItem } from "@prisma/client";
import { toCartItem } from "@/modules/cart/lib/transform";

const CREATED = new Date("2026-07-04T05:00:00Z");
const UPDATED = new Date("2026-07-04T06:00:00Z");

describe("toCartItem", () => {
  it("BigInt id/productId를 number로, Date를 ISO 문자열로 변환한다", () => {
    const row: PrismaCartItem = {
      id: 10n,
      accountId: "acc-1",
      productId: 42n,
      quantity: 3,
      createdAt: CREATED,
      updatedAt: UPDATED,
    };

    const dto = toCartItem(row);

    expect(dto.id).toBe(10);
    expect(dto.productId).toBe(42);
    expect(dto.accountId).toBe("acc-1");
    expect(dto.quantity).toBe(3);
    expect(dto.createdAt).toBe(CREATED.toISOString());
    expect(dto.updatedAt).toBe(UPDATED.toISOString());
  });
});
