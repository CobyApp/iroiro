import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AwsClient } from "aws4fetch";

// 실제 서명 로직 검증을 위해 진짜 AwsClient를 쓴다(로컬 키 — 네트워크 미발생).
vi.mock("@/lib/r2/client", () => ({
  r2: new AwsClient({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    service: "s3",
    region: "auto",
  }),
  r2Endpoint: "http://localhost:9000",
  r2UgcBucket: "test-ugc",
}));

// 204·205·304는 null-body 상태 — 빈 문자열도 바디로 취급돼 Response 생성자가 거부한다.
const NULL_BODY_STATUS = new Set([204, 205, 304]);

function res(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return new Response(NULL_BODY_STATUS.has(status) ? null : body, { status, headers });
}

// backoff 타이머는 r2.sign(WebCrypto, 실제 비동기)·fetch await 뒤에야 스케줄된다. 가짜 시간을
// 고정 횟수만 진행하면 느린 러너에서 타이머가 생기기 전에 루프가 소진돼 영원히 멈춘다(CI 플레이크).
// 그래서 (1) 대상 promise가 settle될 때까지 (2) 매 반복 실제 이벤트 루프에 양보(setImmediate는 가짜로
// 바꾸지 않는다)하며 (3) 실제 경과 시간 상한으로 무한 대기를 막는다.
async function settle<T>(pending: Promise<T>): Promise<T> {
  let settled = false;
  const tracked = pending.finally(() => {
    settled = true;
  });
  tracked.catch(() => {}); // 루프 동안 미처리 거부로 보고되지 않게 핸들러를 붙여둔다
  const deadline = performance.now() + 10_000;
  while (!settled && performance.now() < deadline) {
    await vi.advanceTimersByTimeAsync(100);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return tracked;
}

beforeEach(() => {
  vi.resetModules();
  // setImmediate는 실제로 둔다 — settle()이 이벤트 루프에 양보하는 통로.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("presignUgcPut", () => {
  it("Content-Length·Content-Type·If-None-Match가 SignedHeaders에 포함된다(크기 강제 계약)", async () => {
    const { presignUgcPut } = await import("@/lib/r2/ugc");
    const url = new URL(await presignUgcPut("posts/tmp/a.jpg", "image/jpeg", 1234));
    const signed = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
    expect(signed).toContain("if-none-match");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.pathname).toBe("/test-ugc/posts/tmp/a.jpg");
  });
});

describe("getSignedUgcGetUrl", () => {
  it("기본 TTL 900초 서명 GET URL", async () => {
    const { getSignedUgcGetUrl } = await import("@/lib/r2/ugc");
    const url = new URL(await getSignedUgcGetUrl("posts/a.jpg"));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
    expect(url.pathname).toBe("/test-ugc/posts/a.jpg");
  });
});

describe("headUgcObject", () => {
  it("200이면 etag·contentType·contentLength 반환", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      res(200, { etag: '"abc"', "content-type": "image/jpeg", "content-length": "1234" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(headUgcObject("posts/tmp/a.jpg")).resolves.toEqual({
      etag: '"abc"',
      contentType: "image/jpeg",
      contentLength: 1234,
    });
    expect(fetchMock.mock.calls[0][0].method).toBe("HEAD");
  });

  it("404면 null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(headUgcObject("posts/tmp/none.jpg")).resolves.toBeNull();
  });

  it("5xx는 최대 2회 재시도 후 성공을 수용한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(500))
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, { etag: '"e"' }));
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(settle(headUgcObject("posts/tmp/a.jpg"))).resolves.toMatchObject({ etag: '"e"' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("네트워크 오류도 재시도하고, 3회 모두 실패하면 throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    expect(await settle(headUgcObject("posts/tmp/a.jpg").catch((e) => e))).toBeInstanceOf(
      TypeError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("4xx(400)는 재시도 없이 즉시 throw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(400));
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject, R2RequestError } = await import("@/lib/r2/ugc");
    await expect(headUgcObject("posts/tmp/a.jpg")).rejects.toBeInstanceOf(R2RequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("전체 예산 signal이 abort되면 5xx여도 재시도하지 않고 즉시 중단(P1-3)", async () => {
    const controller = new AbortController();
    // 첫 응답을 받는 순간 예산이 소진된 상황을 재현한다.
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort(new Error("파이프라인 예산 초과"));
      return res(503);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    const outcome = await settle(
      headUgcObject("posts/tmp/a.jpg", { signal: controller.signal }).catch((e) => e),
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1); // backoff가 abort로 즉시 reject
  });

  it("이미 abort된 signal이면 fetch 자체를 시도하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { headUgcObject } = await import("@/lib/r2/ugc");
    await expect(
      headUgcObject("posts/tmp/a.jpg", { signal: AbortSignal.abort(new Error("이미 소진")) }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getUgcObjectRange", () => {
  it("Range·If-Match 헤더로 요청하고 바이트를 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(206, {}, "\xff\xd8\xff"));
    vi.stubGlobal("fetch", fetchMock);
    const { getUgcObjectRange } = await import("@/lib/r2/ugc");
    const bytes = await getUgcObjectRange("posts/tmp/a.jpg", '"abc"', 0, 65535);
    expect(bytes.length).toBeGreaterThan(0);
    const req: Request = fetchMock.mock.calls[0][0];
    expect(req.headers.get("range")).toBe("bytes=0-65535");
    expect(req.headers.get("if-match")).toBe('"abc"');
  });

  it("412면 R2ConditionFailedError(재시도 없음)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(412));
    vi.stubGlobal("fetch", fetchMock);
    const { getUgcObjectRange, R2ConditionFailedError } = await import("@/lib/r2/ugc");
    await expect(getUgcObjectRange("k", '"e"', 0, 10)).rejects.toBeInstanceOf(
      R2ConditionFailedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("copyUgcObject", () => {
  it("copy-source·if-match·REPLACE·Content-Type·Cache-Control 메타를 명시한다(P2-1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, {}, "<CopyObjectResult/>"));
    vi.stubGlobal("fetch", fetchMock);
    const { copyUgcObject } = await import("@/lib/r2/ugc");
    await copyUgcObject("posts/tmp/a.jpg", "posts/a.jpg", '"abc"', "image/jpeg");
    const req: Request = fetchMock.mock.calls[0][0];
    expect(req.method).toBe("PUT");
    expect(new URL(req.url).pathname).toBe("/test-ugc/posts/a.jpg");
    expect(req.headers.get("x-amz-copy-source")).toBe("/test-ugc/posts/tmp/a.jpg");
    expect(req.headers.get("x-amz-copy-source-if-match")).toBe('"abc"');
    expect(req.headers.get("x-amz-metadata-directive")).toBe("REPLACE");
    expect(req.headers.get("content-type")).toBe("image/jpeg");
    expect(req.headers.get("cache-control")).toBe("private, no-store");
  });

  it("412면 R2ConditionFailedError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(412)));
    const { copyUgcObject, R2ConditionFailedError } = await import("@/lib/r2/ugc");
    await expect(copyUgcObject("s", "d", '"e"', "image/png")).rejects.toBeInstanceOf(
      R2ConditionFailedError,
    );
  });

  it("200 응답 바디의 <Error>도 실패로 처리한다(S3 copy 관례)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(res(200, {}, "<Error><Code>InternalError</Code></Error>")),
    );
    const { copyUgcObject, R2RequestError } = await import("@/lib/r2/ugc");
    await expect(copyUgcObject("s", "d", '"e"', "image/png")).rejects.toBeInstanceOf(R2RequestError);
  });
});

describe("deleteUgcObject", () => {
  it("204는 true, 404도 true(멱등), 500 소진 후 false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(204)));
    let mod = await import("@/lib/r2/ugc");
    await expect(mod.deleteUgcObject("k")).resolves.toBe(true);

    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res(404)));
    mod = await import("@/lib/r2/ugc");
    await expect(mod.deleteUgcObject("k")).resolves.toBe(true);

    vi.resetModules();
    const failing = vi.fn().mockResolvedValue(res(500));
    vi.stubGlobal("fetch", failing);
    mod = await import("@/lib/r2/ugc");
    await expect(settle(mod.deleteUgcObject("k"))).resolves.toBe(false); // 실패는 호출부가 로그(보상)
    expect(failing).toHaveBeenCalledTimes(3);
  }, 15_000);
});
