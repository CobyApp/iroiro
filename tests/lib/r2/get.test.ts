import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    R2_PUBLIC_BASE: "https://cdn.example.com",
    R2_ENDPOINT: "http://localhost:9000",
    R2_BUCKET: "test-bucket",
    R2_ACCESS_KEY_ID: "x",
    R2_SECRET_ACCESS_KEY: "y",
    R2_UGC_BUCKET: "test-ugc",
  },
}));

import { fetchR2Object } from "@/lib/r2/get";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("fetchR2Object", () => {
  it("happy path — body·contentType·contentLength 반환", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "12345" },
      }),
    );

    const result = await fetchR2Object("products/1/photo.jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.contentLength).toBe(12345);
    expect(result.body).toBeInstanceOf(ReadableStream);
  });

  it("비공개 S3 엔드포인트를 서명한 GET Request로 fetch", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream(), { status: 200 }));
    global.fetch = fetchSpy;

    await fetchR2Object("products/1/photo.jpg");
    const request = fetchSpy.mock.calls[0][0] as Request;
    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "http://localhost:9000/test-bucket/products/1/photo.jpg",
    );
    expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("404 응답이면 에러 throw (status·statusText 포함)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 404, statusText: "Not Found" }),
      );

    await expect(fetchR2Object("missing.jpg")).rejects.toThrow(/404/);
  });

  it("500 응답이면 에러 throw", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchR2Object("broken.jpg")).rejects.toThrow(/500/);
  });

  it("contentType 누락 시 application/octet-stream fallback", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream(), { status: 200 }));

    const result = await fetchR2Object("k.jpg");
    expect(result.contentType).toBe("application/octet-stream");
  });

  it("contentLength 누락 시 null", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream(), { status: 200 }));

    const result = await fetchR2Object("k.jpg");
    expect(result.contentLength).toBeNull();
  });

  it("contentLength가 숫자가 아니면 null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream(), {
        status: 200,
        headers: { "content-length": "not-a-number" },
      }),
    );

    const result = await fetchR2Object("k.jpg");
    expect(result.contentLength).toBeNull();
  });
});
