import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    R2_PUBLIC_BASE: "https://cdn.example.com",
    R2_ENDPOINT: "http://localhost:9000",
    R2_BUCKET: "test-bucket",
    R2_ACCESS_KEY_ID: "x",
    R2_SECRET_ACCESS_KEY: "y",
    R2_UGC_BUCKET: "test-ugc",
    R2_REGION: "auto",
    CATALOG_BUCKET: "test-catalog",
    CATALOG_PUBLIC_BASE: "https://catalog.example.com",
  },
}));

import {
  catalogPublicUrl,
  deleteCatalogObject,
  fetchCatalogObject,
  putCatalogObject,
  readObjectBytes,
} from "@/lib/r2/catalog";

const originalFetch = global.fetch;
const KEY = "cards/wm/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jpg";

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  global.fetch = originalFetch;
});

function lastRequest(spy: ReturnType<typeof vi.fn>): Request {
  return spy.mock.calls[0][0] as Request;
}

describe("lib/r2/catalog — 공유 카탈로그 버킷", () => {
  it("catalogPublicUrl 은 CATALOG_PUBLIC_BASE + 키", () => {
    expect(catalogPublicUrl(KEY)).toBe(`https://catalog.example.com/${KEY}`);
  });

  it("putCatalogObject — 카탈로그 버킷 경로로 서명된 PUT, Content-Type·Length 명시", async () => {
    const spy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = spy;
    await putCatalogObject(KEY, Buffer.from([1, 2, 3]), "image/jpeg");
    const req = lastRequest(spy);
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`http://localhost:9000/test-catalog/${KEY}`);
    expect(req.headers.get("content-type")).toBe("image/jpeg");
    expect(req.headers.get("content-length")).toBe("3");
    expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
  });

  it("putCatalogObject — 실패 응답은 예외", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: "Forbidden" }));
    await expect(putCatalogObject(KEY, Buffer.from([1]), "image/jpeg")).rejects.toThrow(/403/);
  });

  it("fetchCatalogObject — 서명 GET, body·contentType·contentLength 반환", async () => {
    const spy = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([7, 8]), {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "2" },
      }),
    );
    global.fetch = spy;
    const out = await fetchCatalogObject(KEY);
    expect(lastRequest(spy).method).toBe("GET");
    expect(lastRequest(spy).url).toBe(`http://localhost:9000/test-catalog/${KEY}`);
    expect(out.contentType).toBe("image/jpeg");
    expect(out.contentLength).toBe(2);
    expect(await readObjectBytes(out)).toEqual(Buffer.from([7, 8]));
  });

  it("fetchCatalogObject — 404 는 예외(호출부가 폴백·404 로 결과화)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" }));
    await expect(fetchCatalogObject(KEY)).rejects.toThrow(/404/);
  });

  it("deleteCatalogObject — 멱등: 200 과 404 모두 true, 그 외 false", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await deleteCatalogObject(KEY)).toBe(true);
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await deleteCatalogObject(KEY)).toBe(true);
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    expect(await deleteCatalogObject(KEY)).toBe(false);
  });
});
