import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPendingAccount } from "@/modules/auth/lib/pending-account";
import { hashSessionToken } from "@/modules/auth/lib/session";

const pendingAccountMock = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pendingAccount: pendingAccountMock,
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

describe("pending account", () => {
  beforeEach(() => {
    pendingAccountMock.create.mockReset();
    pendingAccountMock.delete.mockReset();
    pendingAccountMock.findUnique.mockReset();
  });

  it("createPendingAccount: tokenHash 필드에 가입 토큰 해시를 저장한다", async () => {
    pendingAccountMock.create.mockResolvedValue({});

    const claims = {
      provider: "kakao" as const,
      providerUserId: "123456789",
      email: "user@example.com",
      displayName: "홍길동",
    };

    const { token, expiresAt } = await createPendingAccount(claims);

    expect(expiresAt).toBeInstanceOf(Date);
    expect(pendingAccountMock.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashSessionToken(token),
        provider: claims.provider,
        providerUserId: claims.providerUserId,
        email: claims.email,
        displayName: claims.displayName,
        expiresAt,
      },
    });
  });
});
