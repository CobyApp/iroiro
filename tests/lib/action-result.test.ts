import { describe, expect, it } from "vitest";
import { DomainError, runAction } from "@/lib/action-result";

describe("runAction", () => {
  it("정상 종료 시 ok:true + data 반환", async () => {
    const result = await runAction(async () => 42);
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it("data가 없는 액션은 ok:true + data:undefined", async () => {
    const result = await runAction(async () => {});
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("DomainError는 ok:false + message/code로 변환(사용자 표시용)", async () => {
    const result = await runAction(async () => {
      throw new DomainError("이미 신고한 글입니다", "duplicate");
    });
    expect(result).toEqual({
      ok: false,
      message: "이미 신고한 글입니다",
      code: "duplicate",
    });
  });

  it("code 생략 시 code는 undefined", async () => {
    const result = await runAction(async () => {
      throw new DomainError("재고가 부족합니다");
    });
    expect(result).toEqual({ ok: false, message: "재고가 부족합니다", code: undefined });
  });

  it("일반 Error(무결성·시스템)는 삼키지 않고 그대로 re-throw", async () => {
    await expect(
      runAction(async () => {
        throw new Error("데이터 무결성 오류");
      }),
    ).rejects.toThrow("데이터 무결성 오류");
  });

  it("redirect/notFound 유사 신호(비 DomainError)도 그대로 re-throw", async () => {
    // next의 redirect()는 digest가 붙은 Error를 throw한다 — DomainError가 아니므로 통과해야 함.
    const redirectLike = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    await expect(
      runAction(async () => {
        throw redirectLike;
      }),
    ).rejects.toBe(redirectLike);
  });
});
