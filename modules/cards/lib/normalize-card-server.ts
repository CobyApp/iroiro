import "server-only";

import sharp from "sharp";
import { watermarkOverlaySvg } from "@/lib/image/watermark";

// Server-side card image normalization — a 1:1 port of oshikore-card `core/image_utils.py`
// (`normalize_card_image`). Runs at save time so the stored object always meets the spec,
// whatever the client sent:
//   1) apply EXIF orientation, then strip metadata
//   2) center-crop to 63:88 (physical trading-card size 63mm × 88mm)
//   3) resize to a fixed width (720px → 1006px tall), Lanczos
//   4) bake in the brand watermark once (serving is a plain static URL — no per-request compositing)
//   5) JPEG q72, progressive, optimized (mozjpeg)
// Deviation from the Python original: transparent pixels are flattened onto white
// (PIL `convert("RGB")` drops alpha onto black, which looks wrong for scans).

export const CARD_ASPECT = 63 / 88; // width / height ≈ 0.7159
export const CARD_TARGET_WIDTH = 720;
// 워터마크를 구워 넣으므로 예전(82)보다 낮춰 파일을 더 줄인다 — 카드 크기에선 열화가 눈에 안 띈다.
export const CARD_JPEG_QUALITY = 72;

const MAX_INPUT_PIXELS = 40_000_000;

export type NormalizeCardOptions = {
  targetWidth?: number;
  quality?: number;
  // false면 워터마크를 생략(테스트·특수 용도). 기본은 등록 저장이므로 true.
  watermark?: boolean;
};

export async function normalizeCardImageBuffer(
  input: Buffer,
  {
    targetWidth = CARD_TARGET_WIDTH,
    quality = CARD_JPEG_QUALITY,
    watermark = true,
  }: NormalizeCardOptions = {},
): Promise<Buffer> {
  const targetHeight = Math.max(1, Math.round(targetWidth / CARD_ASPECT));
  const resized = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // EXIF orientation → pixels; metadata is dropped unless withMetadata() is called
    .flatten({ background: "#ffffff" })
    .resize(targetWidth, targetHeight, {
      fit: "cover", // = center-crop to 63:88, then scale to the fixed size
      position: "centre",
      kernel: "lanczos3",
    });

  if (watermark) {
    // 출력 크기가 고정(targetWidth×targetHeight)이라 오버레이 크기를 바로 안다.
    const overlay = await watermarkOverlaySvg(targetWidth, targetHeight);
    resized.composite([{ input: overlay, blend: "over" }]);
  }

  return resized.jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
}
