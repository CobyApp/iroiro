import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_WIDTH = 1100;
const OUTPUT_HEIGHT = 1500;

let wordmarkPromise: Promise<Buffer> | undefined;

function getWordmark(): Promise<Buffer> {
  wordmarkPromise ??= readFile(
    path.join(process.cwd(), "public/brand/iroiro-wordmark.png"),
  );
  return wordmarkPromise;
}

async function watermarkSvg(width: number, height: number): Promise<Buffer> {
  const wordmark = (await getWordmark()).toString("base64");
  const logoWidth = Math.max(150, Math.round(width * 0.34));
  const logoHeight = Math.round(logoWidth * 0.225);
  const stepX = Math.round(logoWidth * 1.16);
  const stepY = Math.round(logoHeight * 2.75);
  const logos: string[] = [];

  for (let y = -stepY; y < height + stepY; y += stepY) {
    for (let x = -stepX; x < width + stepX; x += stepX) {
      const offset = Math.floor(y / stepY) % 2 === 0 ? 0 : stepX / 2;
      logos.push(
        `<use href="#iroiro-wordmark" x="${x + offset}" y="${y}" opacity="0.24" transform="rotate(-24 ${x + offset + logoWidth / 2} ${y + logoHeight / 2})"/>`,
      );
    }
  }

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><image id="iroiro-wordmark" href="data:image/png;base64,${wordmark}" width="${logoWidth}" height="${logoHeight}"/></defs>${logos.join("")}</svg>`,
  );
}

// 세로 상한 비율(포토카드 3:4 근사) — 폭 기준으로 높이 상한을 계산.
const OUTPUT_RATIO = OUTPUT_HEIGHT / OUTPUT_WIDTH;

export type ProcessOptions = {
  // 출력 최대 폭(px). 상세는 크게, 목록/컬렉션은 작게(전송·인코딩 속도 ↑).
  width: number;
  // 워터마크 합성 여부. 컬렉션(소유자) 페이지는 false.
  watermark: boolean;
  // webp 품질(기본 80).
  quality?: number;
};

// 상품 이미지를 지정 폭으로 리사이즈하고(WebP), 필요 시 워터마크를 합성한다.
// 워터마크를 생략하면 오버레이 생성·합성을 건너뛰어 더 빠르다.
export async function processProductImage(
  input: Buffer,
  { width, watermark, quality = 80 }: ProcessOptions,
): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > MAX_INPUT_BYTES) {
    throw new Error("Product image exceeds processing limit");
  }

  const maxWidth = Math.min(OUTPUT_WIDTH, Math.max(1, Math.round(width)));
  const maxHeight = Math.round(maxWidth * OUTPUT_RATIO);

  const pipeline = sharp(input, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Product image dimensions are unavailable");
  }

  const resized = pipeline.resize({
    width: maxWidth,
    height: maxHeight,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (watermark) {
    // 실제 출력 크기(리사이즈 후)에 맞춰 워터마크 오버레이 생성.
    const scale = Math.min(
      1,
      maxWidth / metadata.width,
      maxHeight / metadata.height,
    );
    const outW = Math.max(1, Math.round(metadata.width * scale));
    const outH = Math.max(1, Math.round(metadata.height * scale));
    const overlay = await watermarkSvg(outW, outH);
    resized.composite([{ input: overlay, blend: "over" }]);
  }

  return resized.webp({ quality, effort: 4 }).toBuffer();
}
