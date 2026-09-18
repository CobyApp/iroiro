import "server-only";

import sharp from "sharp";

// Server-side card image normalization — a 1:1 port of oshikore-card `core/image_utils.py`
// (`normalize_card_image`). Runs at save time so the stored object always meets the spec,
// whatever the client sent:
//   1) apply EXIF orientation, then strip metadata
//   2) center-crop to 63:88 (physical trading-card size 63mm × 88mm)
//   3) resize to a fixed width (720px → 1006px tall), Lanczos
//   4) JPEG q82, progressive, optimized (mozjpeg)
// Deviation from the Python original: transparent pixels are flattened onto white
// (PIL `convert("RGB")` drops alpha onto black, which looks wrong for scans).

export const CARD_ASPECT = 63 / 88; // width / height ≈ 0.7159
export const CARD_TARGET_WIDTH = 720;
export const CARD_JPEG_QUALITY = 82;

const MAX_INPUT_PIXELS = 40_000_000;

export type NormalizeCardOptions = {
  targetWidth?: number;
  quality?: number;
};

export async function normalizeCardImageBuffer(
  input: Buffer,
  { targetWidth = CARD_TARGET_WIDTH, quality = CARD_JPEG_QUALITY }: NormalizeCardOptions = {},
): Promise<Buffer> {
  const targetHeight = Math.max(1, Math.round(targetWidth / CARD_ASPECT));
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // EXIF orientation → pixels; metadata is dropped unless withMetadata() is called
    .flatten({ background: "#ffffff" })
    .resize(targetWidth, targetHeight, {
      fit: "cover", // = center-crop to 63:88, then scale to the fixed size
      position: "centre",
      kernel: "lanczos3",
    })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer();
}
