import { beforeEach, describe, expect, it, vi } from "vitest";

// 상품 일괄수정은 스토어·배송 공간 가드(requireDeliveryManager) — 액션 경계만 검증하도록 스텁한다.
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/modules/admin/lib/requireAdminSpace", () => ({
  requireDeliveryManager: mockRequireAdmin,
}));

const updateMany = vi.fn();
vi.mock("@/lib/db", () => ({ db: { product: { updateMany } } }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("bulkUpdateProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    updateMany.mockResolvedValue({ count: 0 });
  });

  it("선택한 id에만 상태를 일괄 적용한다", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    const result = await bulkUpdateProducts([1, 2], { saleStatus: "active" });

    expect(result).toEqual({ ok: true, data: { updated: 2 } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1n, 2n] } },
      data: expect.objectContaining({ saleStatus: "active" }),
    });
  });

  it("재고를 일괄 설정한다", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    await bulkUpdateProducts([1, 2], { stockQuantity: 5 });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1n, 2n] } },
      data: expect.objectContaining({ stockQuantity: 5 }),
    });
  });

  it("중복 id는 한 번만 센다", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    const result = await bulkUpdateProducts([1, 1, 2], { stockQuantity: 1 });
    expect(result).toEqual({ ok: true, data: { updated: 2 } });
  });

  // 판매가 인상 시 정가가 더 낮은 행만 먼저 끌어올린다 —
  // 정가 >= 새 판매가인 행은 lt 조건에서 빠져 할인 표시가 보존된다.
  it("판매가 변경은 정가 상향(lt 한정) 후 판매가 적용 순으로 실행된다", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    await bulkUpdateProducts([1, 2], { salePrice: 9000 });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: [1n, 2n] }, regularPrice: { lt: 9000 } },
      data: expect.objectContaining({ regularPrice: 9000 }),
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [1n, 2n] } },
      data: expect.objectContaining({ salePrice: 9000 }),
    });
  });

  it("빈 선택은 에러", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    expect(await bulkUpdateProducts([], { saleStatus: "active" })).toMatchObject({ ok: false, message: expect.stringMatching(/선택된 상품/) });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("변경할 항목이 없으면 에러", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    expect(await bulkUpdateProducts([1], {})).toMatchObject({ ok: false, message: expect.stringMatching(/변경할 항목/) });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("음수 재고는 에러", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    expect(await bulkUpdateProducts([1], { stockQuantity: -1 })).toMatchObject({ ok: false, message: expect.stringMatching(/재고/) });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("잘못된 판매 상태는 에러", async () => {
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    expect(await bulkUpdateProducts([1], {
        saleStatus: "sold" as unknown as "active",
      })).toMatchObject({ ok: false, message: expect.stringMatching(/판매 상태/) });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("비관리자는 거부된다", async () => {
    // 인가 실패는 DomainError가 아니므로 runAction이 그대로 re-throw한다(ok:false 아님).
    mockRequireAdmin.mockRejectedValue(new Error("권한이 없습니다"));
    const { bulkUpdateProducts } = await import("@/modules/products/actions");
    await expect(
      bulkUpdateProducts([1], { stockQuantity: 1 }),
    ).rejects.toThrow(/권한/);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
