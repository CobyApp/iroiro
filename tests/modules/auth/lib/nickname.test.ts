import { describe, expect, it } from "vitest";

import { NICKNAME_MAX_LENGTH, parseNickname } from "@/modules/auth/lib/nickname";

describe("parseNickname", () => {
  it("앞뒤 공백을 제거한다", () => {
    expect(parseNickname("  민수  ")).toBe("민수");
  });

  it("빈 문자열은 거부 (필수)", () => {
    expect(() => parseNickname("")).toThrow(/입력/);
  });

  it("공백만 입력은 거부 (trim 후 빈 값)", () => {
    expect(() => parseNickname("   ")).toThrow(/입력/);
  });

  it(`최대 ${NICKNAME_MAX_LENGTH}자 경계값은 허용`, () => {
    const max = "가".repeat(NICKNAME_MAX_LENGTH);
    expect(parseNickname(max)).toBe(max);
  });

  it(`${NICKNAME_MAX_LENGTH}자 초과는 거부`, () => {
    expect(() => parseNickname("가".repeat(NICKNAME_MAX_LENGTH + 1))).toThrow(
      new RegExp(`${NICKNAME_MAX_LENGTH}`),
    );
  });

  it("길이는 코드포인트 기준 — 이모지(서로게이트 쌍)를 1자로 센다", () => {
    // "😀" 는 UTF-16 length 2 지만 1 코드포인트. MAX개면 통과해야 한다.
    const emojis = "😀".repeat(NICKNAME_MAX_LENGTH);
    expect(parseNickname(emojis)).toBe(emojis);
  });
});
