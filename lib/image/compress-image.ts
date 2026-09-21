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

// 두 벌 결과 — clean(원본, 비공개 보관)과 wm(워터마크, 공개 서빙). 같은 리사이즈 결과에서 인코딩만 두 번.
export type ImageVariants = { clean: Buffer; wm: Buffer };

function resizePipeline(input: Buffer, maxDim: number): Sharp {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: "lanczos3",
    });
}

function encodeJpeg(pipeline: Sharp, quality: number): Promise<Buffer> {
  return pipeline.jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
}

// 리사이즈 결과의 raw 픽셀 — 워터마크는 실제 출력 크기에 맞춰야 하므로 크기를 먼저 얻는다.
// raw 픽셀을 거쳐 합성하면 중간 JPEG 인코딩 없이 최종 1회만 인코딩한다.
async function rawResized(input: Buffer, maxDim: number) {
  const { data, info } = await resizePipeline(input, maxDim)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fromRaw = () =>
    sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  return { fromRaw, width: info.width, height: info.height };
}

export async function compressImageBuffer(
  input: Buffer,
  {
    maxDim = COMPRESS_DEFAULT_MAX_DIM,
    quality = COMPRESS_DEFAULT_QUALITY,
    watermark = false,
  }: CompressImageOptions = {},
): Promise<Buffer> {
  if (!watermark) return encodeJpeg(resizePipeline(input, maxDim), quality);
  const { fromRaw, width, height } = await rawResized(input, maxDim);
  const overlay = await watermarkOverlaySvg(width, height);
  return encodeJpeg(fromRaw().composite([{ input: overlay, blend: "over" }]), quality);
}

// 한 번 리사이즈해 clean·wm 두 벌을 만든다 — 상품 사진 업로드가 쓴다(저장은 두 키로).
export async function compressImageVariants(
  input: Buffer,
  {
    maxDim = COMPRESS_DEFAULT_MAX_DIM,
    quality = COMPRESS_DEFAULT_QUALITY,
  }: Omit<CompressImageOptions, "watermark"> = {},
): Promise<ImageVariants> {
  const { fromRaw, width, height } = await rawResized(input, maxDim);
  const overlay = await watermarkOverlaySvg(width, height);
  const [clean, wm] = await Promise.all([
    encodeJpeg(fromRaw(), quality),
    encodeJpeg(fromRaw().composite([{ input: overlay, blend: "over" }]), quality),
  ]);
  return { clean, wm };
}
