import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/modules/admin/lib/requireBoardManager", () => ({
  requireBoardManager: vi.fn(),
}));

const accountFindUnique = vi.fn();
const accountUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    account: { findUnique: accountFindUnique, update: accountUpdate },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ADMIN = "01900000-0000-7000-8000-0000000000ad";
const TARGET = "01900000-0000-7000-8000-0000000000cc";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: ADMIN });
  accountFindUnique.mockResolvedValue({ deletedAt: null });
  accountUpdate.mockResolvedValue({});
});

describe("setSiteAdmin", () => {
  it("requireAdmin 실패 시 예외를 전파한다", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { setSiteAdmin } = await import("@/modules/admin/actions/users");
    await expect(
      setSiteAdmin({ accountId: TARGET, isAdmin: true }),
    ).rejects.toThrow(/관리자 권한/);
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("본인 권한은 변경할 수 없다", async () => {
    const { setSiteAdmin } = await import("@/modules/admin/actions/users");
    const res = await setSiteAdmin({ accountId: ADMIN, isAdmin: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("본인");
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("없는/탈퇴 회원은 거부한다", async () => {
    accountFindUnique.mockResolvedValue(null);
    const { setSiteAdmin } = await import("@/modules/admin/actions/users");
    const res = await setSiteAdmin({ accountId: TARGET, isAdmin: true });
    expect(res.ok).toBe(false);
    expect(accountUpdate).not.toHaveBeenCalled();
  });

  it("관리자로 지정하면 is_admin=true & 작성 제재를 해제한다", async () => {
    const { setSiteAdmin } = await import("@/modules/admin/actions/users");
    const res = await setSiteAdmin({ accountId: TARGET, isAdmin: true });
    expect(res.ok).toBe(true);
    const data = accountUpdate.mock.calls[0][0].data;
    expect(data.isAdmin).toBe(true);
    expect(data.postingBannedAt).toBeNull();
    expect(data.postingBanReason).toBeNull();
  });

  it("관리자 해제 시 is_admin=false, 제재 필드는 건드리지 않는다", async () => {
    const { setSiteAdmin } = await import("@/modules/admin/actions/users");
    const res = await setSiteAdmin({ accountId: TARGET, isAdmin: false });
    expect(res.ok).toBe(true);
    const data = accountUpdate.mock.calls[0][0].data;
    expect(data.isAdmin).toBe(false);
    expect("postingBannedAt" in data).toBe(false);
  });
});
