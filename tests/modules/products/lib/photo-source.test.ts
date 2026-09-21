import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2/get", () => ({ fetchR2Object: vi.fn() }));

import { fetchR2Object } from "@/lib/r2/get";
import { fetchProductPhotoOriginal } from "@/modules/products/lib/photo-source";

const obj = (tag: string) => ({ body: new Response(tag).body!, contentType: "image/jpeg", contentLength: 1 });

beforeEach(() => vi.clearAllMocks());

describe("fetchProductPhotoOriginal — clean 우선, 없으면 wm 폴백", () => {
  it("products/original 키는 products/clean 을 먼저 읽는다", async () => {
    vi.mocked(fetchR2Object).mockResolvedValue(obj("clean"));
    await fetchProductPhotoOriginal("products/original/abc.jpg");
    expect(fetchR2Object).toHaveBeenCalledTimes(1);
    expect(fetchR2Object).toHaveBeenCalledWith("products/clean/abc.jpg");
  });

  it("clean 이 없으면(예전 사진) 저장된 wm 키로 폴백한다", async () => {
    vi.mocked(fetchR2Object)
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce(obj("wm"));
    const out = await fetchProductPhotoOriginal("products/original/abc.jpg");
    expect(vi.mocked(fetchR2Object).mock.calls.map((c) => c[0])).toEqual([
      "products/clean/abc.jpg",
      "products/original/abc.jpg",
    ]);
    expect(await new Response(out.body).text()).toBe("wm");
  });

  it("규약 밖 키(중고 매물 등)는 clean 시도 없이 그 키만 읽는다", async () => {
    vi.mocked(fetchR2Object).mockResolvedValue(obj("x"));
    await fetchProductPhotoOriginal("used/original/u.jpg");
    expect(fetchR2Object).toHaveBeenCalledTimes(1);
    expect(fetchR2Object).toHaveBeenCalledWith("used/original/u.jpg");
  });

  it("둘 다 없으면 오류를 그대로 던진다(호출부가 404 로 결과화)", async () => {
    vi.mocked(fetchR2Object).mockRejectedValue(new Error("missing"));
    await expect(fetchProductPhotoOriginal("products/original/abc.jpg")).rejects.toThrow("missing");
  });
});
