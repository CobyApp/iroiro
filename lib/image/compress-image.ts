import "server-only";

import sharp from "sharp";

// Server-side "compress, don't crop" — a port of oshikore-card `core/image_utils.py`
// `compress_image`: EXIF orientation applied, metadata stripped, longest side scaled down to
// `maxDim` (never enlarged), re-encoded as progressive optimized JPEG. For photos whose framing
// must be preserved (product shots, marketplace listings); cards use the 63:88 normalizer instead.
// Deviation from the Python original: alpha is flattened onto white instead of black.

export const COMPRESS_DEFAULT_MAX_DIM = 900;
export const COMPRESS_DEFAULT_QUALITY = 80;

const MAX_INPUT_PIXELS = 40_000_000;

export type CompressImageOptions = {
  maxDim?: number;
  quality?: number;
};

export async function compressImageBuffer(
  input: Buffer,
  { maxDim = COMPRESS_DEFAULT_MAX_DIM, quality = COMPRESS_DEFAULT_QUALITY }: CompressImageOptions = {},
): Promise<Buffer> {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: "lanczos3",
    })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer();
}
