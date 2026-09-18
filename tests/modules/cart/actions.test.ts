import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// P2025 = update/delete 대상 없음(TOCTOU not-found) 재현 fixture.
function p2025() {
  return new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "test",
  });
}

// getCurrentAccount는 DB 세션 기반 — 소유권 경계 검증을 위해 스텁.
const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

const productFindUnique = vi.fn();
const cartFindUnique = vi.fn();
const upsert = vi.fn();
const update = vi.fn();
const deleteFn = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: { findUnique: productFindUnique },
    cartItem: {
      findUnique: cartFindUnique,
      upsert,
      update,
      delete: deleteFn,
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount.mockReset().mockResolvedValue({ id: ACCOUNT_ID });
  productFindUnique
    .mockReset()
    .mockResolvedValue({ stockQuantity: 5, saleStatus: "active" });
  cartFindUnique.mockReset().mockResolvedValue(null);
  upsert.mockReset().mockResolvedValue({});
  update.mockReset().mockResolvedValue({});
  deleteFn.mockReset().mockResolvedValue({});
});

describe("cart actions", () => {
  describe("addCartItem", () => {
    it("판매 중인 상품을 장바구니에 담는다(happy)", async () => {
      const { addCartItem } = await import("@/modules/cart/actions");
      const result = await addCartItem({ productId: 1, quantity: 2 });

      expect(result).toEqual({ ok: true, data: undefined });
      const args = upsert.mock.calls[0][0];
      expect(args.create).toEqual({
        accountId: ACCOUNT_ID,
        productId: 1n,
        quantity: 2,
      });
    });

    it("같은 상품을 다시 담으면 수량을 합산한다", async () => {
      cartFindUnique.mockResolvedValue({ quantity: 2 });
      const { addCartItem } = await import("@/modules/cart/actions");
      const result = await addCartItem({ productId: 1, quantity: 1 });

      expect(result).toEqual({ ok: true, data: undefined });
      expect(upsert.mock.calls[0][0].update.quantity).toBe(3);
    });

    it("로그인하지 않으면 거부한다(auth)", async () => {
      mockGetCurrentAccount.mockResolvedValue(null);
      const { addCartItem } = await import("@/modules/cart/actions");

      const result = await addCartItem({ productId: 1, quantity: 1 });
      expect(result).toEqual({
        ok: false,
        message: "로그인이 필요합니다",
        code: undefined,
      });
      expect(productFindUnique).not.toHaveBeenCalled();
    });

    it("quantity가 0이면 schema 검증 실패(zod)", async () => {
      const { addCartItem } = await import("@/modules/cart/actions");
      const result = await addCartItem({ productId: 1, quantity: 0 });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(upsert).not.toHaveBeenCalled();
    });

    it("판매 중이 아닌 상품은 담을 수 없다", async () => {
      productFindUnique.mockResolvedValue({
        stockQuantity: 5,
        saleStatus: "archived",
      });
      const { addCartItem } = await import("@/modules/cart/actions");

      const result = await addCartItem({ productId: 1, quantity: 1 });
      expect(result).toEqual({
        ok: false,
        message: "판매 중인 상품이 아닙니다",
        code: undefined,
      });
    });

    it("재고를 초과하면 담을 수 없다", async () => {
      productFindUnique.mockResolvedValue({
        stockQuantity: 1,
        saleStatus: "active",
      });
      const { addCartItem } = await import("@/modules/cart/actions");

      const result = await addCartItem({ productId: 1, quantity: 2 });
      expect(result).toEqual({
        ok: false,
        message: "재고가 부족합니다",
        code: undefined,
      });
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe("updateCartItemQuantity", () => {
    it("수량을 절대값으로 변경한다", async () => {
      cartFindUnique.mockResolvedValue({
        id: 1n,
        accountId: ACCOUNT_ID,
        productId: 10n,
      });
      const { updateCartItemQuantity } = await import("@/modules/cart/actions");
      const result = await updateCartItemQuantity({ cartItemId: 1, quantity: 4 });

      expect(result).toEqual({ ok: true, data: undefined });
      expect(update.mock.calls[0][0].data.quantity).toBe(4);
    });

    it("다른 사람의 항목은 변경할 수 없다(소유권)", async () => {
      cartFindUnique.mockResolvedValue({
        id: 99n,
        accountId: OTHER_ACCOUNT_ID,
        productId: 10n,
      });
      const { updateCartItemQuantity } = await import("@/modules/cart/actions");

      const result = await updateCartItemQuantity({
        cartItemId: 99,
        quantity: 2,
      });
      expect(result).toEqual({
        ok: false,
        message: "장바구니 항목을 찾을 수 없습니다",
        code: undefined,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("로그인하지 않으면 거부한다(auth)", async () => {
      mockGetCurrentAccount.mockResolvedValue(null);
      const { updateCartItemQuantity } = await import("@/modules/cart/actions");
      const result = await updateCartItemQuantity({
        cartItemId: 1,
        quantity: 2,
      });
      expect(result).toEqual({
        ok: false,
        message: "로그인이 필요합니다",
        code: undefined,
      });
    });

    it("재고를 초과하면 변경할 수 없다", async () => {
      cartFindUnique.mockResolvedValue({
        id: 1n,
        accountId: ACCOUNT_ID,
        productId: 10n,
      });
      // productFindUnique 기본 목(stockQuantity: 5, beforeEach)을 그대로 사용 — 요청 수량 6이 초과.
      const { updateCartItemQuantity } = await import("@/modules/cart/actions");
      const result = await updateCartItemQuantity({ cartItemId: 1, quantity: 6 });

      expect(result).toEqual({
        ok: false,
        message: "재고가 부족합니다",
        code: undefined,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("도메인 오류 — 동시 삭제로 update가 P2025(TOCTOU)면 ok:false로 반환한다", async () => {
      cartFindUnique.mockResolvedValue({
        id: 1n,
        accountId: ACCOUNT_ID,
        productId: 10n,
      });
      update.mockRejectedValueOnce(p2025());
      const { updateCartItemQuantity } = await import("@/modules/cart/actions");
      const result = await updateCartItemQuantity({ cartItemId: 1, quantity: 2 });
      expect(result).toMatchObject({
        ok: false,
        message: "장바구니 항목을 찾을 수 없습니다",
      });
    });
  });

  describe("removeCartItem", () => {
    it("본인 항목을 삭제한다", async () => {
      cartFindUnique.mockResolvedValue({
        id: 1n,
        accountId: ACCOUNT_ID,
        productId: 10n,
      });
      const { removeCartItem } = await import("@/modules/cart/actions");
      const result = await removeCartItem({ cartItemId: 1 });

      expect(result).toEqual({ ok: true, data: undefined });
      expect(deleteFn).toHaveBeenCalledWith({ where: { id: 1n } });
    });

    it("다른 사람의 항목은 삭제할 수 없다(소유권)", async () => {
      cartFindUnique.mockResolvedValue({
        id: 99n,
        accountId: OTHER_ACCOUNT_ID,
        productId: 10n,
      });
      const { removeCartItem } = await import("@/modules/cart/actions");

      const result = await removeCartItem({ cartItemId: 99 });
      expect(result).toEqual({
        ok: false,
        message: "장바구니 항목을 찾을 수 없습니다",
        code: undefined,
      });
      expect(deleteFn).not.toHaveBeenCalled();
    });

    it("로그인하지 않으면 거부한다(auth)", async () => {
      mockGetCurrentAccount.mockResolvedValue(null);
      const { removeCartItem } = await import("@/modules/cart/actions");
      const result = await removeCartItem({ cartItemId: 1 });
      expect(result).toEqual({
        ok: false,
        message: "로그인이 필요합니다",
        code: undefined,
      });
    });

    it("도메인 오류 — 동시 삭제로 delete가 P2025(TOCTOU)면 ok:false로 반환한다", async () => {
      cartFindUnique.mockResolvedValue({
        id: 1n,
        accountId: ACCOUNT_ID,
        productId: 10n,
      });
      deleteFn.mockRejectedValueOnce(p2025());
      const { removeCartItem } = await import("@/modules/cart/actions");
      const result = await removeCartItem({ cartItemId: 1 });
      expect(result).toMatchObject({
        ok: false,
        message: "장바구니 항목을 찾을 수 없습니다",
      });
    });
  });
});
