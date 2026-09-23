import { describe, expect, it } from "vitest";
import {
  courierLabel,
  courierTrackingUrl,
  isCourierCode,
} from "@/lib/shipping/couriers";

describe("couriers", () => {
  it("등록된 택배사 코드만 유효", () => {
    expect(isCourierCode("cj")).toBe(true);
    expect(isCourierCode("epost")).toBe(true);
    expect(isCourierCode("nope")).toBe(false);
  });

  it("라벨 — 코드로 이름, 없으면 코드/기본값", () => {
    expect(courierLabel("cj")).toBe("CJ대한통운");
    expect(courierLabel(null)).toBe("택배");
  });

  it("조회 URL — 송장번호를 인코딩해 넣는다", () => {
    const url = courierTrackingUrl("cj", "12345678");
    expect(url).toContain("cjlogistics.com");
    expect(url).toContain("12345678");
  });

  it("기타(etc)·빈값은 링크 없음(null)", () => {
    expect(courierTrackingUrl("etc", "12345678")).toBeNull();
    expect(courierTrackingUrl("cj", null)).toBeNull();
    expect(courierTrackingUrl(null, "123")).toBeNull();
  });
});
