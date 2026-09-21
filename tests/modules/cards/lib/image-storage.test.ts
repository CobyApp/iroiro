import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("uuid", () => ({ v7: vi.fn(() => "0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b") }));
vi.mock("@/lib/r2/catalog", () => ({ putCatalogObject: vi.fn(async () => {}) }));
vi.mock("@/modules/cards/lib/normalize-card-server", () => ({
  normalizeCardImageVariants: vi.fn(async () => ({
    clean: Buffer.from("clean-jpeg"),
    wm: Buffer.from("wm-jpeg"),
  })),
}));

import { putCatalogObject } from "@/lib/r2/catalog";
import { normalizeCardImageVariants } from "@/modules/cards/lib/normalize-card-server";
import { storeCardFrontImage } from "@/modules/cards/lib/image-storage";

beforeEach(() => vi.clearAllMocks());

describe("storeCardFrontImage — 정규화 후 clean·wm 두 벌을 카탈로그 버킷에", () => {
  it("한 id 로 두 키를 만들고 각 벌을 image/jpeg 로 올린 뒤 wm 키를 돌려준다", async () => {
    const input = Buffer.from("source");
    const out = await storeCardFrontImage(input);

    expect(normalizeCardImageVariants).toHaveBeenCalledWith(input);
    expect(out).toEqual({
      wmKey: "cards/wm/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jpg",
      cleanKey: "cards/clean/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jpg",
    });
    const calls = vi.mocked(putCatalogObject).mock.calls.map(([key, body, type]) => [key, body.toString(), type]);
    expect(calls).toEqual(
      expect.arrayContaining([
        [out.cleanKey, "clean-jpeg", "image/jpeg"],
        [out.wmKey, "wm-jpeg", "image/jpeg"],
      ]),
    );
    expect(calls).toHaveLength(2);
  });

  it("업로드 실패는 그대로 전파한다(액션이 사용자 메시지로 바꾼다)", async () => {
    vi.mocked(putCatalogObject).mockRejectedValueOnce(new Error("put failed"));
    await expect(storeCardFrontImage(Buffer.from("x"))).rejects.toThrow("put failed");
  });
});
