import "server-only";

import sharp from "sharp";

// 상품 이미지 서빙 변형 — /media 라우트 전용. 저장된 원본(업로드 시 워터마크가 이미 구워짐)을
// 요청 변형 크기로 리사이즈해 WebP로 인코딩한다. 예전엔 여기서 요청마다 워터마크를 합성해
// 느렸으나, 이제 워터마크는 업로드 시 1회만 구워 넣으므로 서빙은 리사이즈·인코딩만 한다.

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const OUTPUT_WIDTH = 1100;
const OUTPUT_HEIGHT = 1500;

// 세로 상한 비율(포토카드 3:4 근사) — 폭 기준으로 높이 상한을 계산.
const OUTPUT_RATIO = OUTPUT_HEIGHT / OUTPUT_WIDTH;

export type ProcessOptions = {
  // 출력 최대 폭(px). 상세는 크게, 목록/컬렉션은 작게(전송·인코딩 속도 ↑).
  width: number;
  // webp 품질(기본 80).
  quality?: number;
};

// 상품 이미지를 지정 폭으로 리사이즈하고 WebP로 인코딩한다(워터마크 합성 없음).
export async function processProductImage(
  input: Buffer,
  { width, quality = 80 }: ProcessOptions,
): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > MAX_INPUT_BYTES) {
    throw new Error("Product image exceeds processing limit");
  }

  const maxWidth = Math.min(OUTPUT_WIDTH, Math.max(1, Math.round(width)));
  const maxHeight = Math.round(maxWidth * OUTPUT_RATIO);

  return sharp(input, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();
}
