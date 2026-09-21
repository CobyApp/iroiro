import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2/catalog", () => ({ fetchCatalogObject: vi.fn() }));

import { fetchCatalogObject } from "@/lib/r2/catalog";
import { catalogCleanImageResponse } from "@/modules/cards/lib/clean-media-response";

const ID = "0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const CLEAN = `cards/clean/${ID}.jpg`;
const WM = `cards/wm/${ID}.jpg`;

function obj(bytes: number[], contentType = "image/jpeg") {
  return { body: new Response(new Uint8Array(bytes)).body!, contentType, contentLength: bytes.length };
}

beforeEach(() => vi.clearAllMocks());

describe("catalogCleanImageResponse — 관리자용 clean 원본 프록시(인가는 라우트가 끝낸 뒤)", () => {
  it("규약 밖 키·경로 조작은 버킷을 조회하지 않고 404", async () => {
    for (const key of [
      "cards/clean/../wm/x.jpg",
      "products/clean/abc.jpg",
      "cards/clean/not-a-uuid.jpg",
      `cards/clean/${ID}.png`,
      "",
    ]) {
      expect((await catalogCleanImageResponse(key)).status).toBe(404);
    }
    expect(fetchCatalogObject).not.toHaveBeenCalled();
  });

  it("clean 키는 그대로 읽어 private 캐시·nosniff 로 스트리밍한다", async () => {
    vi.mocked(fetchCatalogObject).mockResolvedValue(obj([1, 2, 3]));
    const res = await catalogCleanImageResponse(CLEAN);
    expect(res.status).toBe(200);
    expect(fetchCatalogObject).toHaveBeenCalledTimes(1);
    expect(fetchCatalogObject).toHaveBeenCalledWith(CLEAN);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toMatch(/^private/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("clean 이 없으면 같은 id 의 wm 으로 폴백한다", async () => {
    vi.mocked(fetchCatalogObject)
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce(obj([9]));
    const res = await catalogCleanImageResponse(CLEAN);
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchCatalogObject).mock.calls.map((c) => c[0])).toEqual([CLEAN, WM]);
  });

  it("예전 규약 키(cards/original·cards/wm)는 그 키만 읽는다", async () => {
    vi.mocked(fetchCatalogObject).mockResolvedValue(obj([1]));
    expect((await catalogCleanImageResponse(`cards/original/${ID}.jpg`)).status).toBe(200);
    expect(fetchCatalogObject).toHaveBeenCalledWith(`cards/original/${ID}.jpg`);
    expect(fetchCatalogObject).toHaveBeenCalledTimes(1);
  });

  it("모든 후보가 없으면 404 — 오류 내용은 노출하지 않는다", async () => {
    vi.mocked(fetchCatalogObject).mockRejectedValue(new Error("secret bucket detail"));
    const res = await catalogCleanImageResponse(CLEAN);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});
