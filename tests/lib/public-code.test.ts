import { describe, expect, it } from "vitest";

import {
  ACCOUNT_CODE_ALPHABET,
  ACCOUNT_CODE_LENGTH,
  generateAccountCode,
  generatePublicCode,
  PUBLIC_CODE_ALPHABET,
  PUBLIC_CODE_LENGTH,
} from "@/lib/public-code";

describe("generatePublicCode (base62 URL 코드)", () => {
  it("길이는 항상 PUBLIC_CODE_LENGTH", () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePublicCode()).toHaveLength(PUBLIC_CODE_LENGTH);
    }
  });

  it("알파벳(base62) 문자만 사용", () => {
    const re = new RegExp(`^[${PUBLIC_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 100; i++) {
      expect(generatePublicCode()).toMatch(re);
    }
  });

  it("연속 생성 시 중복 없음(엔트로피 sanity)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generatePublicCode());
    expect(set.size).toBe(1000);
  });
});

describe("generateAccountCode (Base58 계정 코드)", () => {
  it("길이는 항상 ACCOUNT_CODE_LENGTH(8)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateAccountCode()).toHaveLength(ACCOUNT_CODE_LENGTH);
    }
  });

  it("혼동 문자(0, O, I, l)를 포함하지 않는다", () => {
    expect(ACCOUNT_CODE_ALPHABET).not.toMatch(/[0OIl]/);
    const re = new RegExp(`^[${ACCOUNT_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 200; i++) {
      expect(generateAccountCode()).toMatch(re);
    }
  });

  it("연속 생성 시 중복 없음(엔트로피 sanity)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateAccountCode());
    expect(set.size).toBe(1000);
  });
});
