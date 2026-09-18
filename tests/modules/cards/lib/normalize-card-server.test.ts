import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  CARD_ASPECT,
  CARD_TARGET_WIDTH,
  normalizeCardImageBuffer,
} from "@/modules/cards/lib/normalize-card-server";

// Card(oshikore-card) tests/test_image_utils.py와 같은 케이스를 그대로 검증한다.
const EXPECTED_HEIGHT = Math.round(CARD_TARGET_WIDTH / CARD_ASPECT); // 1006

async function jpeg(width: number, height: number, quality = 95): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#b45a8c" } })
    .jpeg({ quality })
    .toBuffer();
}

describe("normalizeCardImageBuffer", () => {
  it("가로로 긴 원본을 63:88 카드 비율·고정 해상도(720×1006)로 만든다", async () => {
    const out = await normalizeCardImageBuffer(await jpeg(4000, 1200));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([CARD_TARGET_WIDTH, EXPECTED_HEIGHT]);
    expect(Math.abs(meta.width! / meta.height! - CARD_ASPECT)).toBeLessThan(0.01);
  });

  it("세로로 긴 원본은 상하를 잘라 같은 크기가 된다", async () => {
    const out = await normalizeCardImageBuffer(await jpeg(800, 3000));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([CARD_TARGET_WIDTH, EXPECTED_HEIGHT]);
  });

  it("큰 원본은 확실히 작아진다(720px + q82)", async () => {
    const raw = await sharp({
      create: { width: 3000, height: 4000, channels: 3, background: "#123456", noise: { type: "gaussian", mean: 128, sigma: 40 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const out = await normalizeCardImageBuffer(raw);
    expect(out.byteLength).toBeLessThan(raw.byteLength);
  });

  it("출력은 progressive JPEG이고 EXIF 등 메타데이터가 제거된다", async () => {
    const withExif = await sharp(await jpeg(1200, 1600)).withMetadata({ exif: { IFD0: { Copyright: "x" } } }).toBuffer();
    const out = await normalizeCardImageBuffer(withExif);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.isProgressive).toBe(true);
    expect(meta.exif).toBeUndefined();
  });

  it("EXIF orientation을 반영해 세운 뒤 크롭한다", async () => {
    // 6 = 90° 회전 — 물리적으로 1600×1200(가로)인 픽셀이 세워져야 함. 세운 결과가 1200×1600이라
    // 상하 크롭 없이 좌우만 살짝 잘려 720×1006이 된다(회전을 무시하면 결과가 달라지지 않지만,
    // 회전 여부는 방향 마커가 사라졌는지로 확인한다).
    const rotated = await sharp(await jpeg(1600, 1200)).withMetadata({ orientation: 6 }).toBuffer();
    const out = await normalizeCardImageBuffer(rotated);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([CARD_TARGET_WIDTH, EXPECTED_HEIGHT]);
    expect(meta.orientation).toBeUndefined();
  });

  it("투명 PNG는 흰 배경에 합성한 RGB JPEG가 된다", async () => {
    const png = await sharp({ create: { width: 900, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const out = await normalizeCardImageBuffer(png);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.channels).toBe(3);
    const { dominant } = await sharp(out).stats();
    expect(dominant.r).toBeGreaterThan(240);
  });

  it("target_width를 바꾸면 비율에 맞춰 높이도 바뀐다", async () => {
    const out = await normalizeCardImageBuffer(await jpeg(2000, 2000), { targetWidth: 480 });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([480, Math.round(480 / CARD_ASPECT)]);
  });

  it("이미지가 아니면 거부한다", async () => {
    await expect(normalizeCardImageBuffer(Buffer.from("not an image"))).rejects.toThrow();
  });
});
