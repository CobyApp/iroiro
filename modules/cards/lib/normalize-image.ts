// 카드 이미지 정규화 — 토레카분석기(oshikore-card core/image_utils.py) 규격 포팅.
//
// 실제 트레카 물리 규격: 63mm(가로) × 88mm(세로). PhotoScan 등으로 찍은 사진은
// 비율 제각각·용량 큼 → 업로드 전에 브라우저에서 일괄 정규화:
//   1) EXIF orientation 반영 (createImageBitmap이 처리)
//   2) center-crop → 63:88
//   3) 고정 해상도 resize (가로 720px, 세로 ≈1006px)
//   4) JPEG 압축 (q0.82)

export const CARD_ASPECT = 63 / 88; // 가로/세로 ≈ 0.7159
export const TARGET_WIDTH = 720;
export const JPEG_QUALITY = 0.82;
const WATERMARK_TEXT = "IROIRO";

// 도용 방지 워터마크 — 대각선 반복 텍스트. 밝은/어두운 배경 모두에서
// 보이도록 어두운 외곽선 + 밝은 본문을 겹쳐 그린다.
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  const size = Math.round(w * 0.13);
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const dy of [-h * 0.32, 0, h * 0.32]) {
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = Math.max(2, size * 0.04);
    ctx.strokeText(WATERMARK_TEXT, 0, dy);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText(WATERMARK_TEXT, 0, dy);
  }
  ctx.restore();
}

export async function normalizeCardImage(file: File): Promise<Blob> {
  // imageOrientation: "from-image" — EXIF 회전 반영.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width: w, height: h } = bitmap;

    // center-crop 영역 계산 (63:88)
    let sx = 0;
    let sy = 0;
    let sw = w;
    let sh = h;
    const cur = w / h;
    if (cur > CARD_ASPECT) {
      sw = Math.max(1, Math.round(h * CARD_ASPECT));
      sx = Math.floor((w - sw) / 2);
    } else if (cur < CARD_ASPECT) {
      sh = Math.max(1, Math.round(w / CARD_ASPECT));
      sy = Math.floor((h - sh) / 2);
    }

    const targetH = Math.max(1, Math.round(TARGET_WIDTH / CARD_ASPECT));
    const canvas = document.createElement("canvas");
    canvas.width = TARGET_WIDTH;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들 수 없어요");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, targetH);
    drawWatermark(ctx, TARGET_WIDTH, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("이미지 변환에 실패했어요");
    return blob;
  } finally {
    bitmap.close();
  }
}
