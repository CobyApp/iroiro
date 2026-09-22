import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

import {
  requireAdminSpace,
  requireCatalogManager,
  requireDeliveryManager,
  requireUsedManager,
} from "@/modules/admin/lib/requireAdminSpace";

beforeEach(() => {
  mockGetCurrentAccount.mockReset();
});

describe("requireAdminSpace — 공간별 Server Action 가드", () => {
  it("해당 부분 권한이 있으면 검증된 계정을 반환한다", async () => {
    mockGetCurrentAccount.mockResolvedValue({ id: "u-1", isAdmin: false, adminRoles: ["catalog"] });
    await expect(requireAdminSpace("catalog")).resolves.toMatchObject({ id: "u-1" });
  });

  it("site admin 은 모든 공간을 통과한다", async () => {
    mockGetCurrentAccount.mockResolvedValue({ id: "admin-1", isAdmin: true, adminRoles: [] });
    await expect(requireAdminSpace("delivery")).resolves.toMatchObject({ id: "admin-1" });
    await expect(requireAdminSpace("used")).resolves.toMatchObject({ id: "admin-1" });
  });

  it("다른 공간 권한만 있으면 해당 공간 라벨로 거부한다", async () => {
    mockGetCurrentAccount.mockResolvedValue({ id: "u-2", isAdmin: false, adminRoles: ["community"] });
    await expect(requireAdminSpace("catalog")).rejects.toThrow(/토레카 관리 권한/);
  });

  it("세션이 없으면 거부한다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    await expect(requireAdminSpace("delivery")).rejects.toThrow(/권한/);
  });
});

describe("공간별 편의 가드", () => {
  it("각 가드는 대응 공간 권한만 통과시킨다", async () => {
    mockGetCurrentAccount.mockResolvedValue({ id: "d-1", isAdmin: false, adminRoles: ["delivery"] });
    await expect(requireDeliveryManager()).resolves.toMatchObject({ id: "d-1" });
    await expect(requireCatalogManager()).rejects.toThrow(/토레카 관리 권한/);
    await expect(requireUsedManager()).rejects.toThrow(/중고거래 관리 권한/);
  });
});
