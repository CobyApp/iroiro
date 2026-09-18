import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ db: { wishlist: { findMany } } }));

// 상품 본문 조회는 products 도메인 소관 — 여기서는 "찜 순서 유지"만 검증한다.
const getProductsByIds = vi.fn();
vi.mock("@/modules/products/lib/queries", () => ({ getProductsByIds }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getWishlistProductIds", () => {
  it("bigint productId를 문자열 Set으로 반환한다", async () => {
    findMany.mockResolvedValue([{ productId: 1n }, { productId: 42n }]);
    const { getWishlistProductIds } = await import(
      "@/modules/wishlist/lib/queries"
    );

    const ids = await getWishlistProductIds("acc-1");
    expect(ids).toEqual(new Set(["1", "42"]));
    expect(findMany).toHaveBeenCalledWith({
      where: { accountId: "acc-1" },
      select: { productId: true },
    });
  });

  it("찜이 없으면 빈 Set", async () => {
    findMany.mockResolvedValue([]);
    const { getWishlistProductIds } = await import(
      "@/modules/wishlist/lib/queries"
    );

    expect((await getWishlistProductIds("acc-1")).size).toBe(0);
  });
});

describe("listWishlistProducts", () => {
  it("찜이 없으면 상품 조회 없이 빈 배열", async () => {
    findMany.mockResolvedValue([]);
    const { listWishlistProducts } = await import(
      "@/modules/wishlist/lib/queries"
    );

    expect(await listWishlistProducts("acc-1")).toEqual([]);
    expect(getProductsByIds).not.toHaveBeenCalled();
  });

  it("상품 조회 결과 순서와 무관하게 찜 최신순을 유지한다", async () => {
    // 찜 최신순: 3 → 1 → 2
    findMany.mockResolvedValue([
      { productId: 3n },
      { productId: 1n },
      { productId: 2n },
    ]);
    // 상품 조회는 임의 순서로 돌려준다(보통 id 오름차순).
    getProductsByIds.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const { listWishlistProducts } = await import(
      "@/modules/wishlist/lib/queries"
    );

    const result = await listWishlistProducts("acc-1");
    expect(result.map((p) => p.id)).toEqual([3, 1, 2]);
    expect(getProductsByIds).toHaveBeenCalledWith([3, 1, 2]);
  });

  it("삭제되어 조회되지 않는 상품은 결과에서 빠진다", async () => {
    findMany.mockResolvedValue([{ productId: 1n }, { productId: 2n }]);
    getProductsByIds.mockResolvedValue([{ id: 2 }]); // 1번은 사라짐
    const { listWishlistProducts } = await import(
      "@/modules/wishlist/lib/queries"
    );

    expect((await listWishlistProducts("acc-1")).map((p) => p.id)).toEqual([2]);
  });

  it("최신순으로 조회한다", async () => {
    findMany.mockResolvedValue([]);
    const { listWishlistProducts } = await import(
      "@/modules/wishlist/lib/queries"
    );
    await listWishlistProducts("acc-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { accountId: "acc-1" },
      orderBy: { createdAt: "desc" },
      select: { productId: true },
    });
  });
});
