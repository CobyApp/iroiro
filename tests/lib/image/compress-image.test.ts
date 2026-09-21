import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { compressImageBuffer } from "@/lib/image/compress-image";

// Card(oshikore-card) core/image_utils.py `compress_image`와 같은 계약: 크롭 없이 비율 유지.
async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#4a6", noise: { type: "gaussian", mean: 128, sigma: 30 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("compressImageBuffer", () => {
  it("긴 변을 maxDim 이하로 줄이고 원본 비율을 유지한다(크롭 없음)", async () => {
    const out = await compressImageBuffer(await jpeg(4000, 3000), { maxDim: 2000, quality: 82 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([2000, 1500]);
  });

  it("maxDim보다 작은 원본은 확대하지 않는다", async () => {
    const out = await compressImageBuffer(await jpeg(800, 600), { maxDim: 2000 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it("세로 사진도 긴 변 기준으로 줄인다", async () => {
    const out = await compressImageBuffer(await jpeg(1200, 3200), { maxDim: 1600 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([600, 1600]);
  });

  it("출력은 progressive JPEG(RGB)이고 메타데이터가 없으며 원본보다 작다", async () => {
    const raw = await jpeg(3000, 2000);
    const out = await compressImageBuffer(raw, { maxDim: 2000, quality: 82 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.isProgressive).toBe(true);
    expect(meta.channels).toBe(3);
    expect(meta.exif).toBeUndefined();
    expect(out.byteLength).toBeLessThan(raw.byteLength);
  });

  it("EXIF orientation을 픽셀에 반영한다", async () => {
    const rotated = await sharp(await jpeg(1600, 900)).withMetadata({ orientation: 6 }).toBuffer();
    const out = await compressImageBuffer(rotated, { maxDim: 4000 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([900, 1600]); // 세워진 결과
    expect(meta.orientation).toBeUndefined();
  });

  it("투명 PNG/WebP는 흰 배경으로 합성된다", async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const { dominant } = await sharp(await compressImageBuffer(png)).stats();
    expect(dominant.r).toBeGreaterThan(240);
  });

  it("이미지가 아니면 거부한다", async () => {
    await expect(compressImageBuffer(Buffer.from("nope"))).rejects.toThrow();
  });

  it("watermark:true여도 크기·비율·포맷은 그대로이고 워터마크로 픽셀이 바뀐다", async () => {
    const src = await jpeg(2000, 1500);
    const plain = await compressImageBuffer(src, { maxDim: 1000, quality: 80 });
    const marked = await compressImageBuffer(src, {
      maxDim: 1000,
      quality: 80,
      watermark: true,
    });
    const meta = await sharp(marked).metadata();
    // 크롭 없음 — 워터마크 있어도 출력 규격은 동일
    expect([meta.width, meta.height]).toEqual([1000, 750]);
    expect(meta.format).toBe("jpeg");
    // 워터마크가 합성되어 워터마크 없는 결과와 바이트가 다르다
    expect(marked.equals(plain)).toBe(false);
  });
});
