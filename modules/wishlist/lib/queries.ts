import "server-only";

import { db } from "@/lib/db";
import { getProductsByIds } from "@/modules/products/lib/queries";
import type { ProductWithPhotos } from "@/modules/products/types";

// 계정이 찜한 상품 id 집합(문자열). ProductGrid에 넘겨 카드별 하트 상태 표시.
export async function getWishlistProductIds(
  accountId: string,
): Promise<Set<string>> {
  const rows = await db.wishlist.findMany({
    where: { accountId },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId.toString()));
}

// 찜한 상품 목록(최신순). 판매중 여부와 무관하게 찜한 그대로 반환.
export async function listWishlistProducts(
  accountId: string,
): Promise<ProductWithPhotos[]> {
  const rows = await db.wishlist.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: { productId: true },
  });
  if (rows.length === 0) return [];
  const products = await getProductsByIds(rows.map((r) => Number(r.productId)));
  // 찜 최신순 유지.
  const byId = new Map(products.map((p) => [p.id.toString(), p]));
  return rows
    .map((r) => byId.get(r.productId.toString()))
    .filter((p): p is ProductWithPhotos => p !== undefined);
}
