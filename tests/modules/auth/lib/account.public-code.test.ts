import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const accountCreate = vi.fn();
const identityCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        account: { create: accountCreate },
        accountIdentity: { create: identityCreate },
      }),
  },
}));

import { createAccountFromSignup } from "@/modules/auth/lib/account";
import { ACCOUNT_CODE_ALPHABET, ACCOUNT_CODE_LENGTH } from "@/lib/public-code";

// Prisma 7 + adapter-pg 실측 P2002 구조 — meta.target은 없고 위반 컬럼은
// meta.driverAdapterError.cause.constraint.fields에 담긴다 (lib/prisma-errors 참고).
function p2002(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Account",
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

const signupInput = {
  provider: "kakao" as const,
  providerUserId: "u-1",
  email: null,
  displayName: "덕후",
};

beforeEach(() => {
  accountCreate.mockReset();
  identityCreate.mockReset();
  identityCreate.mockResolvedValue({});
});

describe("createAccountFromSignup — publicCode", () => {
  it("Base58 8자 publicCode를 생성해 전달한다", async () => {
    accountCreate.mockImplementation(async ({ data }) => data);
    await createAccountFromSignup(signupInput);

    const data = accountCreate.mock.calls[0][0].data;
    expect(data.publicCode).toHaveLength(ACCOUNT_CODE_LENGTH);
    expect(data.publicCode).toMatch(new RegExp(`^[${ACCOUNT_CODE_ALPHABET}]+$`));
  });

  it("public_code 충돌(P2002)이면 재생성해 재시도한다", async () => {
    accountCreate
      .mockRejectedValueOnce(p2002(["public_code"]))
      .mockImplementationOnce(async ({ data }) => data);

    await createAccountFromSignup(signupInput);
    expect(accountCreate).toHaveBeenCalledTimes(2);

    const first = accountCreate.mock.calls[0][0].data.publicCode;
    const second = accountCreate.mock.calls[1][0].data.publicCode;
    expect(first).not.toBe(second);
  });

  it("public_code 외 unique 위반은 즉시 전파한다", async () => {
    accountCreate.mockRejectedValue(p2002(["provider", "provider_user_id"]));
    await expect(createAccountFromSignup(signupInput)).rejects.toThrow();
    expect(accountCreate).toHaveBeenCalledTimes(1);
  });
});
