import { describe, expect, it } from "vitest";
import { decodeOrderNo, formatOrderNo } from "@/modules/orders/lib/order-no";

describe("formatOrderNo", () => {
  it("OSK + base36(경과일 3자리) + base36(당일 시퀀스 6자리) = 12자", () => {
    const orderNo = formatOrderNo(1, "2026-07-01");
    expect(orderNo).toBe("OSK000000001");
    expect(orderNo).toHaveLength(12);
  });

  it.each([
    ["2026-07-01", 1, "OSK000000001"], // 기준일 당일, 첫 채번(경과일 0)
    ["2026-07-12", 42, "OSK00B000016"], // 경과일 11(=B), 42번째(=16)
    ["2027-07-01", 1, "OSK0A5000001"], // 경과일 365(=A5)
  ])("%s seq=%d → %s", (ymd, seq, expected) => {
    expect(formatOrderNo(seq, ymd)).toBe(expected);
  });

  it("모든 자리가 base36 대문자 형식을 만족한다", () => {
    expect(formatOrderNo(12345, "2026-07-12")).toMatch(/^OSK[0-9A-Z]{9}$/);
  });

  it("bigint 시퀀스도 동일하게 처리한다", () => {
    expect(formatOrderNo(42n, "2026-07-12")).toBe("OSK00B000016");
  });
});

describe("decodeOrderNo", () => {
  it("주문번호에서 날짜·시퀀스를 복원한다", () => {
    expect(decodeOrderNo("OSK00B000016")).toEqual({
      date: "2026-07-12",
      seq: 42,
    });
  });

  it.each([
    ["2026-07-01", 1],
    ["2026-07-12", 42],
    ["2026-12-31", 9999],
    ["2030-03-15", 250],
    ["2100-06-01", 123456],
  ])("round-trip: %s seq=%d", (ymd, seq) => {
    expect(decodeOrderNo(formatOrderNo(seq, ymd))).toEqual({ date: ymd, seq });
  });
});
