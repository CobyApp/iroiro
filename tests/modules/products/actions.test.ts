import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Prisma 7 + adapter-pg 실측 P2002 구조 — meta.target은 없고 위반 컬럼은
// meta.driverAdapterError.cause.constraint.fields에 담긴다 (lib/prisma-errors 참고).
// (tests/modules/notices/actions.test.ts 선례)
function p2002(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Product",
      driverAdapterError: {
        cause: {
          originalCode: "23505",
          originalMessage: "duplicate key value violates unique constraint",
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

// P2025 = update/delete 대상 없음(not-found). 실제 Prisma 에러 fixture로 재현.
function p2025() {
  return new Prisma.PrismaClientKnownRequestError("Record to delete does not exist", {
    code: "P2025",
    clientVersion: "test",
  });
}

// 상품 액션은 스토어·배송 공간 가드(requireDeliveryManager) — 액션 경계(허용/거부)만 검증하도록 스텁한다.
const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/modules/admin/lib/requireAdminSpace", () => ({
  requireDeliveryManager: mockRequireAdmin,
}));

const update = vi.fn();
const deleteFn = vi.fn();
const photoDeleteMany = vi.fn();
const photoCreateMany = vi.fn();
const productFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    product: { findUnique: productFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        product: { update, delete: deleteFn },
        productPhoto: {
          deleteMany: photoDeleteMany,
          createMany: photoCreateMany,
        },
      }),
  },
}));

// 찜 알림은 자체 테스트(alert-rules.test.ts)가 있는 경계 — 여기선 no-op 스텁.
vi.mock("@/modules/wishlist/lib/alerts", () => ({
  detectWishlistEvents: vi.fn(() => []),
  notifyWishers: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Prisma row 형태 — update mock이 patch를 병합해 돌려주면 toProduct 변환을 그대로 검증할 수 있다.
const baseRow = {
  id: 2n,
  itemCode: null as string | null,
  itemType: "photocard",
  teamId: 2n as bigint | null,
  memberId: 3n as bigint | null,
  name: "기존 상품",
  description: "기존 설명" as string | null,
  purchasePriceJpy: 2000,
  purchaseExchangeRate: 930,
  purchasePriceKrw: 18600,
  purchaseDate: new Date("2026-04-18T00:00:00Z"),
  regularPrice: 32000,
  salePrice: 28000,
  condition: "good" as string | null,
  stockQuantity: 1,
  saleStatus: "active",
  createdAt: new Date("2026-04-21T11:00:00Z"),
  updatedAt: new Date("2026-04-21T11:00:00Z"),
};

beforeEach(() => {
  vi.resetModules();
  mockRequireAdmin
    .mockReset()
    .mockResolvedValue({ id: "admin-1", isAdmin: true });
  update
    .mockReset()
    .mockImplementation(async ({ data }) => ({ ...baseRow, ...data }));
  deleteFn.mockReset().mockResolvedValue({ ...baseRow });
  productFindUnique.mockReset().mockResolvedValue({ ...baseRow });
  photoDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  photoCreateMany.mockReset().mockResolvedValue({ count: 0 });
});

describe("product actions", () => {
  it("관리자가 아니면 mutation 전에 거부한다(권한)", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { updateProduct } = await import("@/modules/products/actions");

    await expect(updateProduct({ id: 2, name: "x" })).rejects.toThrow(
      /관리자/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("updateProduct에서 nullable 필드(memberId)를 명시적으로 null로 비울 수 있다", async () => {
    const { updateProduct } = await import("@/modules/products/actions");

    const result = await updateProduct({
      id: 2,
      memberId: null,
    });

    if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
    const patch = update.mock.calls[0][0].data;
    expect(patch.memberId).toBeNull();
    expect(result.data.memberId).toBeNull();
  });

  it("updateProduct에서 salePrice를 정가와 같게 되돌릴 수 있다 (할인 해제)", async () => {
    const { updateProduct } = await import("@/modules/products/actions");

    const result = await updateProduct({
      id: 2,
      salePrice: 32000, // regularPrice와 동일 → 할인 없음
    });

    if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
    expect(result.data.salePrice).toBe(32000);
    expect(result.data.regularPrice).toBe(32000);
  });

  it("updateProduct는 salePrice > regularPrice 입력을 입력 검증 실패(ok:false)로 반환한다", async () => {
    const { updateProduct } = await import("@/modules/products/actions");

    // partial update의 refine은 두 값이 함께 올 때 비교 — 같이 전송.
    const result = await updateProduct({
      id: 2,
      salePrice: 100000,
      regularPrice: 50000,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(update).not.toHaveBeenCalled();
  });

  it("createProduct는 필수 입력 누락 시 입력 검증 실패(ok:false)로 반환한다 — 상품 등록 회귀", async () => {
    const { createProduct } = await import("@/modules/products/actions");
    // 상품명 공백 + 사진 없음 → zod 실패 → throw가 아니라 ok:false(토스트로 표시 가능)
    const result = await createProduct({ name: "", photos: [] } as never);
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("도메인 오류 — 아이템 코드·구분 조합이 중복되면 throw가 아니라 ok:false 결과로 반환한다", async () => {
    update.mockRejectedValueOnce(p2002(["item_code"]));
    const { updateProduct } = await import("@/modules/products/actions");

    const result = await updateProduct({ id: 2, itemCode: "DUP-001" });

    expect(result).toEqual({
      ok: false,
      message: "같은 아이템 코드·구분의 상품이 이미 있습니다",
      code: undefined,
    });
  });

  it("도메인 오류 — updateProduct 대상이 없으면(P2025) not-found를 ok:false로 반환한다", async () => {
    update.mockRejectedValueOnce(p2025());
    const { updateProduct } = await import("@/modules/products/actions");

    const result = await updateProduct({ id: 999, name: "x" });

    expect(result).toMatchObject({
      ok: false,
      message: "상품을 찾을 수 없습니다",
    });
  });

  it("도메인 오류 — deleteProduct 대상이 없으면(P2025) not-found를 ok:false로 반환한다", async () => {
    deleteFn.mockRejectedValueOnce(p2025());
    const { deleteProduct } = await import("@/modules/products/actions");

    const result = await deleteProduct(999);

    expect(result).toMatchObject({
      ok: false,
      message: "상품을 찾을 수 없습니다",
    });
  });
});
