"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getCurrentAccount } from "@/modules/auth/dal";

// 찜 토글 — 있으면 해제, 없으면 추가. 로그인 필요. Server Action.
export async function toggleWishlist(
  productId: string,
): Promise<{ wished: boolean }> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");

  const pid = BigInt(productId);
  const existing = await db.wishlist.findUnique({
    where: { accountId_productId: { accountId: account.id, productId: pid } },
  });

  if (existing) {
    await db.wishlist.delete({ where: { id: existing.id } });
    revalidatePath("/wishlist");
    return { wished: false };
  }

  await db.wishlist.create({
    data: { accountId: account.id, productId: pid },
  });
  revalidatePath("/wishlist");
  return { wished: true };
}
