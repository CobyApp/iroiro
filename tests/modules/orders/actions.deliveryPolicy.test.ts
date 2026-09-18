import { beforeEach, describe, expect, it, vi } from "vitest";

// requireAdmin은 세션 DAL 기반 — 이 테스트는 액션 경계(허용/거부)만 검증하도록 스텁한다.
// 가드 자체의 세션·isAdmin 판정은 notices/members 액션 테스트에서 검증한다.
const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({
  requireAdmin: mockRequireAdmin,
}));

const policyUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { deliveryPolicy: { update: policyUpdate } },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  mockRequireAdmin.mockReset().mockResolvedValue(undefined);
  policyUpdate.mockReset().mockResolvedValue({});
});

describe("updateDeliveryPolicy", () => {
  it("배송비·무료 기준을 singleton 1행에 저장한다(happy)", async () => {
    const { updateDeliveryPolicy } = await import("@/modules/orders/actions");

    await updateDeliveryPolicy({
      deliveryFee: 4000,
      freeThresholdAmount: 50000,
    });

    const args = policyUpdate.mock.calls[0][0];
    expect(args.where).toEqual({ id: 1n });
    expect(args.data.deliveryFee).toBe(4000);
    expect(args.data.freeThresholdAmount).toBe(50000);
  });

  it("무료 기준을 null로 비울 수 있다", async () => {
    const { updateDeliveryPolicy } = await import("@/modules/orders/actions");

    await updateDeliveryPolicy({ deliveryFee: 3000, freeThresholdAmount: null });

    expect(policyUpdate.mock.calls[0][0].data.freeThresholdAmount).toBeNull();
  });

  it("관리자가 아니면 거부한다(권한)", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { updateDeliveryPolicy } = await import("@/modules/orders/actions");

    await expect(
      updateDeliveryPolicy({ deliveryFee: 4000, freeThresholdAmount: null }),
    ).rejects.toThrow(/관리자/);
    expect(policyUpdate).not.toHaveBeenCalled();
  });

  it("음수 배송비는 schema 검증 실패(zod)", async () => {
    const { updateDeliveryPolicy } = await import("@/modules/orders/actions");
    const result = await updateDeliveryPolicy({
      deliveryFee: -1,
      freeThresholdAmount: null,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(policyUpdate).not.toHaveBeenCalled();
  });
});
