import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSession,
  generateSessionToken,
  hashSessionToken,
} from "@/modules/auth/lib/session";

const accountSessionMock = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    accountSession: accountSessionMock,
  },
}));

describe("session token", () => {
  beforeEach(() => {
    accountSessionMock.create.mockReset();
    accountSessionMock.delete.mockReset();
    accountSessionMock.deleteMany.mockReset();
    accountSessionMock.findUnique.mockReset();
  });

  it("hashSessionToken: 결정적 SHA-256 hex(64자)", () => {
    const h1 = hashSessionToken("abc");
    expect(h1).toBe(hashSessionToken("abc"));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    // 알려진 SHA-256("abc")
    expect(h1).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashSessionToken: 다른 입력 → 다른 해시", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });

  it("generateSessionToken: 매번 고유, base64url, 256비트", () => {
    const a = generateSessionToken();
    expect(a).not.toBe(generateSessionToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32바이트 base64url
  });

  it("createSession: tokenHash 필드에 토큰 해시를 저장한다", async () => {
    const accountId = "018f40cc-0b4f-7b04-85d8-9f58247a0000";
    accountSessionMock.create.mockResolvedValue({});

    const { token, expiresAt } = await createSession(accountId);

    expect(accountSessionMock.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashSessionToken(token),
        accountId,
        expiresAt,
      },
    });
  });
});
