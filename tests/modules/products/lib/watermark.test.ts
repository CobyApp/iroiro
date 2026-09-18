import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processProductImage } from "@/modules/products/lib/watermark";

async function makeSource() {
  return sharp({
    create: { width: 1600, height: 2200, channels: 3, background: "#f6d4e6" },
  })
    .jpeg()
    .toBuffer();
}

describe("processProductImage", () => {
  it("상세(워터마크) 변형은 지정 폭 이하 WebP로 변환한다", async () => {
    const source = await makeSource();
    const output = await processProductImage(source, {
      width: 1100,
      watermark: true,
    });
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(1100);
    expect(output.equals(source)).toBe(false);
  });

  it("그리드 변형은 상세보다 작게, 워터마크 없이도 처리된다", async () => {
    const source = await makeSource();
    const grid = await processProductImage(source, {
      width: 600,
      watermark: false,
    });
    const meta = await sharp(grid).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(600);
  });

  it("빈 입력은 처리하지 않는다", async () => {
    await expect(
      processProductImage(Buffer.alloc(0), { width: 600, watermark: true }),
    ).rejects.toThrow(/processing limit/);
  });
});
