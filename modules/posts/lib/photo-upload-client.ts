// 클라 업로드 순수 로직(P1-1 순서 계약) — 컴포넌트는 이 모듈의 얇은 배선만 담당한다.
// deps DI(reencode·presign·put)로 브라우저 API 없이 단위 테스트한다(리뷰 P2-5).
import {
  HEIC_TYPES,
  PHOTO_ALLOWED_TYPES,
  UNSUPPORTED_TYPE_MESSAGE,
  putWithRetry,
  type PutFn,
} from "@/lib/photo-client";
import { PHOTO_MAX_COUNT, PHOTO_MAX_FILE_BYTES, PHOTO_MAX_TOTAL_BYTES } from "./schema";

export type UploadedPhotoItem = { pendingPhotoId: number; previewUrl: string; sizeBytes: number };

export type PresignResult =
  | { ok: true; data: { pendingPhotoId: number; r2Key: string; uploadUrl: string }[] }
  | { ok: false; message: string };

export type PreparePhotoDeps = {
  reencode: (file: File) => Promise<Blob>;
  presign: (files: { contentType: string; sizeBytes: number }[]) => Promise<PresignResult>;
  put: PutFn;
};

// 선택 → 재인코딩·리사이즈 → 최종 Blob 확정 → 검증(최종 Blob 기준) → presign → 동일 Blob PUT.
export async function preparePhotos(
  files: File[],
  ctx: { existingCount: number; existingTotalBytes: number },
  deps: PreparePhotoDeps,
): Promise<{ items: UploadedPhotoItem[]; errors: string[] }> {
  const errors: string[] = [];
  if (ctx.existingCount + files.length > PHOTO_MAX_COUNT) {
    return { items: [], errors: [`사진은 최대 ${PHOTO_MAX_COUNT}장입니다`] };
  }

  // ① 재인코딩 → 최종 Blob 확정(파일 단위 실패는 수집하고 계속).
  const blobs: Blob[] = [];
  for (const file of files) {
    if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
      errors.push(`${file.name}: ${UNSUPPORTED_TYPE_MESSAGE}`);
      continue;
    }
    try {
      const blob = await deps.reencode(file);
      if (blob.size > PHOTO_MAX_FILE_BYTES) {
        errors.push(`${file.name}: 사진은 파일당 5MB 이하여야 합니다`);
        continue;
      }
      blobs.push(blob);
    } catch {
      // 디코딩 실패(손상 파일·미지원 코덱). 확장자만 바꾼 HEIC도 여기서 걸린다.
      if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
      errors.push(`${file.name}: 이미지를 처리할 수 없습니다`);
    }
  }
  if (blobs.length === 0) return { items: [], errors };

  // ② 합계 검증(최종 Blob 기준 — P1-1).
  const totalBytes = blobs.reduce((sum, b) => sum + b.size, 0);
  if (ctx.existingTotalBytes + totalBytes > PHOTO_MAX_TOTAL_BYTES) {
    return { items: [], errors: [...errors, "사진 합계는 30MB 이하여야 합니다"] };
  }

  // ③ 대기 사진 생성·presign — 최종 Blob의 type·size로 서명(Content-Length 강제의 근거값).
  const presigned = await deps.presign(
    blobs.map((b) => ({ contentType: b.type, sizeBytes: b.size })),
  );
  if (!presigned.ok) return { items: [], errors: [...errors, presigned.message] };

  // ④ 동일 Blob PUT(브라우저가 Content-Length를 Blob 크기로 자동 설정 → 서명과 일치).
  const items: UploadedPhotoItem[] = [];
  for (const [index, blob] of blobs.entries()) {
    const pending = presigned.data[index];
    try {
      await putWithRetry(deps.put, pending.uploadUrl, blob);
      items.push({
        pendingPhotoId: pending.pendingPhotoId,
        previewUrl: URL.createObjectURL(blob),
        sizeBytes: blob.size,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "사진 업로드에 실패했습니다");
    }
  }
  return { items, errors };
}

// 미리보기 blob URL 해제(P2-3) — 제거·재업로드 요구·언마운트 시 호출해 누수를 막는다.
export function revokePreviews(items: UploadedPhotoItem[]): void {
  for (const item of items) URL.revokeObjectURL(item.previewUrl);
}
