import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { cartItem: { findMany, count } },
}));

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
});

describe("cart queries", () => {
  describe("getCartItems", () => {
    it("본인 계정 스코프 + 최신순 정렬 인자로 조회한다", async () => {
      const { getCartItems } = await import("@/modules/cart/lib/queries");
      await getCartItems(ACCOUNT_ID);

      expect(findMany).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT_ID },
        orderBy: { createdAt: "desc" },
      });
    });

    it("항목이 없으면 빈 배열", async () => {
      const { getCartItems } = await import("@/modules/cart/lib/queries");
      expect(await getCartItems(ACCOUNT_ID)).toEqual([]);
    });
  });

  describe("getCartCount", () => {
    it("본인 계정 스코프의 행 수를 반환한다", async () => {
      count.mockResolvedValue(2);
      const { getCartCount } = await import("@/modules/cart/lib/queries");

      expect(await getCartCount(ACCOUNT_ID)).toBe(2);
      expect(count).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT_ID },
      });
    });
  });
});
