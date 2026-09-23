// 브라우저 표시용 업로드 사진의 공용 클라이언트 프리미티브 — posts·notices가 공유한다.
// 도메인 정책 상수(장수·합계 상한)는 각 도메인 schema가 소유하고, 여기는 포맷·전송 계층만 둔다.
// 클라이언트 컴포넌트가 import하므로 "server-only" 금지.

export const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // HEIC 미지원(P2-4)
export const PHOTO_CLIENT_MAX_DIMENSION = 4_096; // 클라 canvas 리사이즈 상한(긴 변)
// 브라우저 PUT 상한(P2-2) — 멈춘 업로드가 폼을 영구 잠그지 않도록 요청 자체를 끊는다.
export const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;
export const HEIC_TYPES = ["image/heic", "image/heif"];
export const UNSUPPORTED_TYPE_MESSAGE = "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)";

export type PutFn = (url: string, blob: Blob) => Promise<{ status: number }>;

// PUT 재시도 규칙(P2-2 확정): 네트워크 오류·5xx만 1회 재시도.
// 재시도 412 = 최초 PUT이 이미 성공(If-None-Match:*) 후 응답 유실 — 성공 간주(서버 검증이 최종 판정).
// 최초 412 = 새 임시 키가 이미 선점된 비정상 상태 — 실패.
// 실 R2 주의(2026-08-01 게이트): 실 R2에서 관측한 크기 계약 위반의 `403 SignatureDoesNotMatch`
// 응답에는 CORS 헤더가 없어 브라우저에 네트워크 오류로 전달된다(모든 R2 오류 응답의 일반 규칙이
// 아니다 — 같은 게이트에서 412는 판독됐다).
// 즉 위반은 아래 4xx 분기가 아니라 재시도 경로를 타고 실패한다.
// 강제는 서버에서 성립하므로(객체 미생성) 안전하고, 정상 사용자는 선언 크기 = 실제 Blob이라 무관하다.
// 따라서 실패 메시지는 원인을 단정하지 말 것 — "네트워크 오류" 단정 문구 금지.
export async function putWithRetry(put: PutFn, url: string, blob: Blob): Promise<void> {
  const attempt = async (): Promise<{ status: number } | null> => {
    try {
      return await put(url, blob);
    } catch {
      return null; // 네트워크 오류 또는 CORS로 읽히지 않는 거부 응답(실 R2 크기 위반)
    }
  };
  const first = await attempt();
  if (first && (first.status === 200 || first.status === 204)) return;
  if (first && first.status < 500) {
    throw new Error(`사진 업로드에 실패했습니다 (${first.status})`);
  }
  const second = await attempt();
  if (second && (second.status === 200 || second.status === 204 || second.status === 412)) return;
  throw new Error("사진 업로드에 실패했습니다. 다시 시도해주세요");
}

// 브라우저 전용 — canvas 재인코딩·리사이즈(긴 변 maxDimension). EXIF 등 메타데이터 제거 시도(보조 수단).
// quality/outputType 로 압축 강도·포맷을 조절한다(기본: 원본 포맷·0.9). JPEG 출력 시 알파는 흰 배경으로.
export async function reencodeToBlob(
  file: File,
  maxDimension: number,
  quality = 0.9,
  outputType?: string,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 미지원");
    const type = outputType ?? file.type;
    // JPEG 는 투명도가 없으므로 흰 배경을 먼저 깔아 검게 변하지 않게 한다.
    if (type === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
    if (!blob) throw new Error("재인코딩 실패");
    return blob;
  } finally {
    bitmap.close();
  }
}
