import "server-only";

import { compressImageBuffer } from "@/lib/image/compress-image";
import { presignProductPhotos } from "@/modules/products/actions";
import { fetchExternalImage } from "./cutie-card";

// 임포트 저장 규격 — 상품 업로드(uploadProductPhotoFile)와 동일: 긴 변 2000px, q78, 워터마크 굽기.
const IMPORT_MAX_DIM = 2000;
const IMPORT_QUALITY = 78;

// 외부 카드 이미지를 R2로 복사 → 상품 사진 키 반환. 단건/일괄 임포트 공용.
// 토레카분석기에서 가져온 이미지도 저장 시점에 압축·워터마크를 구워 넣어(직접 업로드와 동일)
// 서빙은 정적으로 한다.
export async function copyImageToR2(
  url: string,
  filename: string,
): Promise<string> {
  const { bytes } = await fetchExternalImage(url);
  const processed = await compressImageBuffer(Buffer.from(bytes), {
    maxDim: IMPORT_MAX_DIM,
    quality: IMPORT_QUALITY,
    watermark: true,
  });
  // 정규화 결과는 항상 JPEG이므로 확장자·MIME을 jpg로 고정한다.
  const jpgName = filename.replace(/\.[^.]+$/, "") + ".jpg";
  const presigned = await presignProductPhotos([
    { filename: jpgName, mimeType: "image/jpeg", sizeBytes: processed.length },
  ]);
  if (!presigned.ok) throw new Error(presigned.message);
  const [{ r2Key, uploadUrl }] = presigned.data;
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(processed),
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!put.ok) throw new Error("이미지 업로드에 실패했습니다.");
  return r2Key;
}
