import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAccountFromSignup,
  findAccountByIdentity,
} from "@/modules/auth/lib/account";

const dbMock = vi.hoisted(() => ({
  accountIdentity: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

beforeEach(() => {
  dbMock.accountIdentity.findUnique.mockReset();
  dbMock.$transaction.mockReset();
});

describe("findAccountByIdentity", () => {
  it("신원이 있으면 연결된 account 반환", async () => {
    const account = { id: "acc-1", displayName: "철수" };
    dbMock.accountIdentity.findUnique.mockResolvedValue({ account });

    await expect(findAccountByIdentity("kakao", "k-1")).resolves.toBe(account);
    expect(dbMock.accountIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerUserId: { provider: "kakao", providerUserId: "k-1" },
      },
      include: { account: true },
    });
  });

  it("신원이 없으면 null", async () => {
    dbMock.accountIdentity.findUnique.mockResolvedValue(null);
    await expect(findAccountByIdentity("kakao", "k-1")).resolves.toBeNull();
  });
});

describe("createAccountFromSignup", () => {
  it("account·identity를 한 트랜잭션에서 생성하고 account를 반환", async () => {
    const created = { id: "acc-9", email: "a@b.com", displayName: "민수" };
    const tx = {
      account: { create: vi.fn().mockResolvedValue(created) },
      accountIdentity: { create: vi.fn().mockResolvedValue({}) },
    };
    dbMock.$transaction.mockImplementation(async (cb) => cb(tx));

    const result = await createAccountFromSignup({
      provider: "kakao",
      providerUserId: "k-77",
      email: "a@b.com",
      displayName: "민수",
    });

    expect(result).toBe(created);
    expect(tx.account.create).toHaveBeenCalledWith({
      data: { id: expect.any(String), email: "a@b.com", displayName: "민수", publicCode: expect.any(String) },
    });
    // identity는 방금 만든 account.id에 연결된다
    expect(tx.accountIdentity.create).toHaveBeenCalledWith({
      data: { accountId: "acc-9", provider: "kakao", providerUserId: "k-77" },
    });
  });

  it("account.id는 앱이 생성한 UUIDv7 (DB default 없음)", async () => {
    const tx = {
      account: {
        create: vi
          .fn()
          .mockImplementation(async ({ data }) => ({ id: data.id })),
      },
      accountIdentity: { create: vi.fn().mockResolvedValue({}) },
    };
    dbMock.$transaction.mockImplementation(async (cb) => cb(tx));

    const result = await createAccountFromSignup({
      provider: "kakao",
      providerUserId: "n-1",
      email: null,
      displayName: "x",
    });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
