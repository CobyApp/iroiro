import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatKstDate,
  formatKstDateTime,
  formatKstRelative,
  todayKstYmd,
} from "@/lib/datetime";

describe("formatKstDate", () => {
  it("KST 자정 직후 UTC 시각도 같은 KST 날짜로 표시", () => {
    // 2026-05-17 00:30 KST = 2026-05-16 15:30 UTC
    expect(formatKstDate("2026-05-16T15:30:00Z")).toBe("2026-05-17");
  });

  it("KST 자정 직전 UTC 시각도 KST 기준 날짜", () => {
    // 2026-05-17 23:59 KST = 2026-05-17 14:59 UTC
    expect(formatKstDate("2026-05-17T14:59:00Z")).toBe("2026-05-17");
  });

  it("UTC 자정과 KST 자정이 다른 날짜에 매핑되는 경계", () => {
    // 2026-05-17 00:00 UTC = 2026-05-17 09:00 KST (같은 날)
    expect(formatKstDate("2026-05-17T00:00:00Z")).toBe("2026-05-17");
    // 2026-05-17 16:00 UTC = 2026-05-18 01:00 KST (다음 날)
    expect(formatKstDate("2026-05-17T16:00:00Z")).toBe("2026-05-18");
  });

  it("Date 객체 입력도 동일하게 동작", () => {
    expect(formatKstDate(new Date("2026-05-17T16:00:00Z"))).toBe("2026-05-18");
  });
});

describe("formatKstDateTime", () => {
  it("KST 시·분까지 표시하고 콤마는 공백으로 정규화", () => {
    // 2026-05-17 14:59 UTC = 2026-05-17 23:59 KST
    expect(formatKstDateTime("2026-05-17T14:59:00Z")).toBe("2026-05-17 23:59");
  });

  it("자정 넘는 시각", () => {
    // 2026-05-17 16:30 UTC = 2026-05-18 01:30 KST
    expect(formatKstDateTime("2026-05-17T16:30:00Z")).toBe("2026-05-18 01:30");
  });
});

describe("formatKstRelative", () => {
  const NOW = new Date("2026-05-17T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1분 미만은 '방금'", () => {
    expect(formatKstRelative("2026-05-17T11:59:30Z")).toBe("방금");
  });

  it("1~59분은 'N분 전'", () => {
    expect(formatKstRelative("2026-05-17T11:55:00Z")).toBe("5분 전");
    expect(formatKstRelative("2026-05-17T11:01:00Z")).toBe("59분 전");
  });

  it("1~23시간은 'N시간 전'", () => {
    expect(formatKstRelative("2026-05-17T09:00:00Z")).toBe("3시간 전");
    expect(formatKstRelative("2026-05-16T13:00:00Z")).toBe("23시간 전");
  });

  it("1~6일은 'N일 전'", () => {
    expect(formatKstRelative("2026-05-16T12:00:00Z")).toBe("1일 전");
    // 6일 1시간 전 — floor(6.04) = 6
    expect(formatKstRelative("2026-05-11T11:00:00Z")).toBe("6일 전");
  });

  it("7일 이상은 KST 절대 날짜로 fallback", () => {
    // 2026-05-10 12:00 UTC = 2026-05-10 21:00 KST
    expect(formatKstRelative("2026-05-10T12:00:00Z")).toBe("2026-05-10");
  });
});

describe("todayKstYmd", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("UTC 자정 직후라도 KST 기준 오늘 날짜를 돌려준다", () => {
    // 2026-05-17 00:30 UTC = 2026-05-17 09:30 KST — 같은 날
    vi.setSystemTime(new Date("2026-05-17T00:30:00Z"));
    expect(todayKstYmd()).toBe("2026-05-17");
  });

  it("UTC 늦은 밤 = KST 다음 날 새벽이면 KST 기준 다음 날", () => {
    // 2026-05-17 16:00 UTC = 2026-05-18 01:00 KST
    vi.setSystemTime(new Date("2026-05-17T16:00:00Z"));
    expect(todayKstYmd()).toBe("2026-05-18");
  });
});
