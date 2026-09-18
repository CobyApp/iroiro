import { describe, expect, it, vi } from "vitest";
import { assertWithinRateLimit } from "@/modules/posts/lib/rate-limit";

describe("assertWithinRateLimit", () => {
  const windows = [
    { seconds: 3600, max: 5 },
    { seconds: 86_400, max: 20 },
  ] as const;

  it("모든 윈도가 max 미만이면 통과한다", async () => {
    const counter = vi.fn().mockResolvedValue(4);
    await expect(
      assertWithinRateLimit(windows, counter),
    ).resolves.toBeUndefined();
    expect(counter).toHaveBeenCalledTimes(2);
  });

  it("윈도 카운트가 max 이상이면 거부한다", async () => {
    const counter = vi.fn().mockResolvedValue(5);
    await expect(assertWithinRateLimit(windows, counter)).rejects.toThrow(
      "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요",
    );
  });

  it("두 윈도 중 첫 번째(짧은 윈도)만 초과해도 거부한다", async () => {
    const counter = vi
      .fn()
      .mockResolvedValueOnce(5) // 1시간 윈도: max(5) 이상 → 초과
      .mockResolvedValueOnce(1); // 하루 윈도: max(20) 미만
    await expect(assertWithinRateLimit(windows, counter)).rejects.toThrow();
  });

  it("두 윈도 중 두 번째(긴 윈도)만 초과해도 거부한다", async () => {
    const counter = vi
      .fn()
      .mockResolvedValueOnce(1) // 1시간 윈도: max(5) 미만
      .mockResolvedValueOnce(20); // 하루 윈도: max(20) 이상 → 초과
    await expect(assertWithinRateLimit(windows, counter)).rejects.toThrow();
  });

  it("각 윈도에 seconds만큼 과거로 계산한 since를 전달한다", async () => {
    const counter = vi.fn().mockResolvedValue(0);
    await assertWithinRateLimit(windows, counter);
    const now = Date.now();

    expect(counter).toHaveBeenCalledTimes(2);
    const sinceCalls = counter.mock.calls.map(([since]) => since as Date);

    windows.forEach((w, i) => {
      const elapsed = now - sinceCalls[i].getTime();
      expect(elapsed).toBeGreaterThanOrEqual(w.seconds * 1000);
      expect(elapsed).toBeLessThanOrEqual(w.seconds * 1000 + 1000);
    });
  });
});

describe("배치 requested(P1-3 — presign은 생성되는 대기 사진 수 기준)", () => {
  it("현재 25 + 요청 10 > 상한 30 → 거부", async () => {
    const counter = vi.fn().mockResolvedValue(25);
    await expect(assertWithinRateLimit([{ seconds: 3600, max: 30 }], counter, 10)).rejects.toThrow(
      /너무 잦습니다/,
    );
  });

  it("현재 20 + 요청 10 = 30 → 허용(<= 상한)", async () => {
    const counter = vi.fn().mockResolvedValue(20);
    await expect(
      assertWithinRateLimit([{ seconds: 3600, max: 30 }], counter, 10),
    ).resolves.toBeUndefined();
  });

  it("requested 생략 시 기존 동작(count >= max 거부) 유지", async () => {
    const counter = vi.fn().mockResolvedValue(29);
    await expect(
      assertWithinRateLimit([{ seconds: 3600, max: 30 }], counter),
    ).resolves.toBeUndefined();
  });
});
