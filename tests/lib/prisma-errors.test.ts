import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import {
  isUniqueViolationOn,
  uniqueViolationFields,
} from "@/lib/prisma-errors";

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("err", {
    code,
    clientVersion: "test",
    meta,
  });
}

// Prisma 7 + adapter-pg 실측 구조 (2026-07-20 로컬 unique 위반 재현 결과)
function adapterMeta(fields: string[]) {
  return {
    modelName: "Notice",
    driverAdapterError: {
      cause: {
        originalCode: "23505",
        originalMessage: "duplicate key value violates unique constraint",
        kind: "UniqueConstraintViolation",
        constraint: { fields },
      },
    },
  };
}

describe("uniqueViolationFields", () => {
  it("adapter-pg 실측 구조(driverAdapterError)에서 위반 컬럼을 추출한다", () => {
    const error = knownError("P2002", adapterMeta(["public_code"]));
    expect(uniqueViolationFields(error)).toEqual(["public_code"]);
  });

  it("classic engine의 meta.target 배열을 지원한다", () => {
    const error = knownError("P2002", { target: ["public_code"] });
    expect(uniqueViolationFields(error)).toEqual(["public_code"]);
  });

  it("classic engine의 meta.target 문자열을 지원한다", () => {
    const error = knownError("P2002", { target: "public_code" });
    expect(uniqueViolationFields(error)).toEqual(["public_code"]);
  });

  it("adapter 구조가 있으면 target보다 우선한다", () => {
    const error = knownError("P2002", {
      ...adapterMeta(["item_code"]),
      target: ["stale"],
    });
    expect(uniqueViolationFields(error)).toEqual(["item_code"]);
  });

  it("P2002가 아닌 Prisma 에러는 빈 배열", () => {
    const error = knownError("P2025", adapterMeta(["public_code"]));
    expect(uniqueViolationFields(error)).toEqual([]);
  });

  it("Prisma 에러가 아니면 빈 배열", () => {
    expect(uniqueViolationFields(new Error("boom"))).toEqual([]);
    expect(uniqueViolationFields(undefined)).toEqual([]);
  });

  it("meta에 판별 정보가 없으면 빈 배열", () => {
    expect(uniqueViolationFields(knownError("P2002"))).toEqual([]);
    expect(uniqueViolationFields(knownError("P2002", {}))).toEqual([]);
  });
});

describe("isUniqueViolationOn", () => {
  it("복합 unique의 컬럼 포함 여부로 판별한다", () => {
    const error = knownError(
      "P2002",
      adapterMeta(["item_code", "item_type", "condition"]),
    );
    expect(isUniqueViolationOn(error, "item_code")).toBe(true);
    expect(isUniqueViolationOn(error, "public_code")).toBe(false);
  });

  it("컬럼명은 부분 문자열이 아닌 정확 일치로 검사한다", () => {
    const error = knownError("P2002", adapterMeta(["notice_public_code"]));
    expect(isUniqueViolationOn(error, "public_code")).toBe(false);
  });
});
