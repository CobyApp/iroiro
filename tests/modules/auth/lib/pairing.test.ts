import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, del, upsert, deleteMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  del: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    loginPairing: {
      findUnique,
      delete: del,
      upsert,
      deleteMany,
    },
  },
}));

import {
  claimLoginPairing,
  createLoginPairing,
  isValidPairingCode,
} from "@/modules/auth/lib/pairing";

const CODE = "A".repeat(43); // 43자 base64url 형식

beforeEach(() => {
  vi.clearAllMocks();
  del.mockResolvedValue({});
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 0 });
});

describe("isValidPairingCode", () => {
  it("43자 base64url 만 허용", () => {
    expect(isValidPairingCode(CODE)).toBe(true);
    expect(isValidPairingCode("short")).toBe(false);
    expect(isValidPairingCode("!".repeat(43))).toBe(false);
  });
});

describe("createLoginPairing", () => {
  it("잘못된 코드는 저장하지 않는다", async () => {
    await createLoginPairing("bad", "acc");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("유효 코드는 code↔account 로 upsert 한다", async () => {
    await createLoginPairing(CODE, "acc-1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: CODE } }),
    );
  });
});

describe("claimLoginPairing", () => {
  it("유효·미만료 코드는 account 를 돌려주고 1회용으로 삭제한다", async () => {
    findUnique.mockResolvedValue({
      code: CODE,
      accountId: "acc-9",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const acc = await claimLoginPairing(CODE);
    expect(acc).toBe("acc-9");
    expect(del).toHaveBeenCalledWith({ where: { code: CODE } });
  });

  it("만료된 코드는 삭제하고 null", async () => {
    findUnique.mockResolvedValue({
      code: CODE,
      accountId: "acc-9",
      expiresAt: new Date(Date.now() - 1000),
    });
    const acc = await claimLoginPairing(CODE);
    expect(acc).toBeNull();
    expect(del).toHaveBeenCalled();
  });

  it("없는 코드는 null", async () => {
    findUnique.mockResolvedValue(null);
    expect(await claimLoginPairing(CODE)).toBeNull();
  });

  it("형식이 틀리면 조회조차 안 한다", async () => {
    expect(await claimLoginPairing("bad")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
