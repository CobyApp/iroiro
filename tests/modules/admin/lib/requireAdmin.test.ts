import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

import { requireAdmin } from "@/modules/admin/lib/requireAdmin";

const ADMIN = { id: "admin-1", isAdmin: true };

beforeEach(() => {
  mockGetCurrentAccount.mockReset();
});

describe("requireAdmin — 자체 세션 실검증", () => {
  it("admin 세션이면 검증된 계정을 반환한다", async () => {
    mockGetCurrentAccount.mockResolvedValue(ADMIN);
    await expect(requireAdmin()).resolves.toMatchObject({ id: "admin-1" });
  });

  it("세션이 없으면 권한 에러", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow(/관리자 권한/);
  });

  it("일반 회원(isAdmin=false)이면 권한 에러", async () => {
    mockGetCurrentAccount.mockResolvedValue({ id: "user-1", isAdmin: false });
    await expect(requireAdmin()).rejects.toThrow(/관리자 권한/);
  });
});
