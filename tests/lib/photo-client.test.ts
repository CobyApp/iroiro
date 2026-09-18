import { describe, expect, it, vi } from "vitest";
import { putWithRetry } from "@/lib/photo-client";

const jpegBlob = (size = 1000) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });

describe("putWithRetry — 재시도 규칙(P2-2 확정)", () => {
  // 이 403 분기는 same-origin·비-R2 저장소용 방어다. 실 R2에서 크기 계약 위반의 403은
  // CORS 헤더가 없어 브라우저가 읽지 못하고 fetch가 throw하므로, 아래 "네트워크 오류" 케이스가
  // 실제 위반 경로를 담당한다(2026-08-01 게이트 발견 — Global Constraints 참조).
  it("200/204 즉시 성공, 4xx(403)는 재시도 없이 실패", async () => {
    await expect(
      putWithRetry(vi.fn(async () => ({ status: 204 })), "u", jpegBlob()),
    ).resolves.toBeUndefined();
    const put403 = vi.fn(async () => ({ status: 403 }));
    await expect(putWithRetry(put403, "u", jpegBlob())).rejects.toThrow("403");
    expect(put403).toHaveBeenCalledTimes(1);
  });

  it("최초 412는 실패(임시 키 선점 — 비정상)", async () => {
    const put = vi.fn(async () => ({ status: 412 }));
    await expect(putWithRetry(put, "u", jpegBlob())).rejects.toThrow("412");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("네트워크 오류·5xx는 1회 재시도, 재시도 412는 최초 성공 간주(If-None-Match:*)", async () => {
    const netThen412 = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({ status: 412 });
    await expect(putWithRetry(netThen412, "u", jpegBlob())).resolves.toBeUndefined();

    const fiveThen200 = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });
    await expect(putWithRetry(fiveThen200, "u", jpegBlob())).resolves.toBeUndefined();

    const bothFail = vi.fn().mockRejectedValue(new TypeError("network"));
    await expect(putWithRetry(bothFail, "u", jpegBlob())).rejects.toThrow();
    expect(bothFail).toHaveBeenCalledTimes(2);
  });

  it("timeout(AbortError)도 네트워크 오류로 취급 — 무한 대기 없이 사용자 오류로 끝난다(P2-2)", async () => {
    const timedOut = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(putWithRetry(timedOut, "u", jpegBlob())).rejects.toThrow(/다시 시도/);
    expect(timedOut).toHaveBeenCalledTimes(2); // 1회 재시도 후 종료(멈춘 채 매달리지 않음)
  });
});
