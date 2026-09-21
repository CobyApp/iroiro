import "server-only";

import sharp, { type Sharp } from "sharp";
import { watermarkOverlaySvg } from "./watermark";

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
  // true면 저장 시점에 브랜드 워터마크를 구워 넣는다(서빙 시 재합성 안 함).
  watermark?: boolean;
};

export async function compressImageBuffer(
  input: Buffer,
  {
    maxDim = COMPRESS_DEFAULT_MAX_DIM,
    quality = COMPRESS_DEFAULT_QUALITY,
    watermark = false,
  }: CompressImageOptions = {},
): Promise<Buffer> {
  const resized = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: "lanczos3",
    });

  const encode = (pipeline: Sharp) =>
    pipeline.jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();

  if (!watermark) return encode(resized);

  // 워터마크는 실제 출력 크기에 맞춰야 하므로 리사이즈 결과의 픽셀·크기를 먼저 얻는다.
  // raw 픽셀을 거쳐 합성하면 중간 JPEG 인코딩 없이 최종 1회만 인코딩한다.
  const { data, info } = await resized
    .raw()
    .toBuffer({ resolveWithObject: true });
  const overlay = await watermarkOverlaySvg(info.width, info.height);
  return encode(
    sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    }).composite([{ input: overlay, blend: "over" }]),
  );
}
