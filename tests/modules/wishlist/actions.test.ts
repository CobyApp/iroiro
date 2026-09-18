import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  wishlist: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const dal = vi.hoisted(() => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/modules/auth/dal", () => dal);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { toggleWishlist } from "@/modules/wishlist/actions";

beforeEach(() => vi.clearAllMocks());

describe("toggleWishlist", () => {
  it("비로그인이면 throw — 아무것도 안 함", async () => {
    dal.getCurrentAccount.mockResolvedValue(null);
    await expect(toggleWishlist("1")).rejects.toThrow();
    expect(db.wishlist.create).not.toHaveBeenCalled();
    expect(db.wishlist.delete).not.toHaveBeenCalled();
  });

  it("찜이 없으면 추가하고 wished=true", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    db.wishlist.findUnique.mockResolvedValue(null);
    const res = await toggleWishlist("42");
    expect(res).toEqual({ wished: true });
    expect(db.wishlist.create).toHaveBeenCalledWith({
      data: { accountId: "acc-1", productId: 42n },
    });
    expect(db.wishlist.delete).not.toHaveBeenCalled();
  });

  it("이미 찜이면 해제하고 wished=false", async () => {
    dal.getCurrentAccount.mockResolvedValue({ id: "acc-1" });
    db.wishlist.findUnique.mockResolvedValue({ id: 7n });
    const res = await toggleWishlist("42");
    expect(res).toEqual({ wished: false });
    expect(db.wishlist.delete).toHaveBeenCalledWith({ where: { id: 7n } });
    expect(db.wishlist.create).not.toHaveBeenCalled();
  });
});
