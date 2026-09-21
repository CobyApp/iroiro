import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compressImageVariants } from "@/lib/image/compress-image";

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#4a6", noise: { type: "gaussian", mean: 128, sigma: 30 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("compressImageVariants — clean·wm 두 벌", () => {
  it("같은 리사이즈 결과에서 두 JPEG 를 만들고 크기가 같다", async () => {
    const { clean, wm } = await compressImageVariants(await jpeg(3000, 2000), { maxDim: 1500 });
    const [c, w] = await Promise.all([sharp(clean).metadata(), sharp(wm).metadata()]);
    expect([c.width, c.height]).toEqual([1500, 1000]);
    expect([w.width, w.height]).toEqual([1500, 1000]);
    expect(c.format).toBe("jpeg");
    expect(w.format).toBe("jpeg");
  });

  it("wm 은 워터마크가 합성되어 clean 과 픽셀이 다르다", async () => {
    const { clean, wm } = await compressImageVariants(await jpeg(1200, 900), { maxDim: 1200 });
    const [c, w] = await Promise.all([
      sharp(clean).raw().toBuffer(),
      sharp(wm).raw().toBuffer(),
    ]);
    expect(c.equals(w)).toBe(false);
  });
});
