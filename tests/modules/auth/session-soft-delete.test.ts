import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  accountSession: { findUnique: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { validateSessionToken } from "@/modules/auth/lib/session";

beforeEach(() => vi.clearAllMocks());

describe("validateSessionToken — soft delete", () => {
  it("계정이 탈퇴(deletedAt) 상태면 세션 무효(null)", async () => {
    db.accountSession.findUnique.mockResolvedValue({
      tokenHash: "h",
      expiresAt: new Date(Date.now() + 100000),
      account: { id: "a1", deletedAt: new Date() },
    });
    expect(await validateSessionToken("tok")).toBeNull();
  });

  it("정상 계정이면 세션 반환", async () => {
    const expiresAt = new Date(Date.now() + 100000);
    db.accountSession.findUnique.mockResolvedValue({
      tokenHash: "h",
      expiresAt,
      account: { id: "a1", deletedAt: null },
    });
    const r = await validateSessionToken("tok");
    expect(r?.account.id).toBe("a1");
  });
});
