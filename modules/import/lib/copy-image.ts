import "server-only";

import { presignProductPhotos } from "@/modules/products/actions";
import { fetchExternalImage } from "./cutie-card";

// 외부 카드 이미지를 R2로 복사 → 상품 사진 키 반환. 단건/일괄 임포트 공용.
export async function copyImageToR2(
  url: string,
  filename: string,
): Promise<string> {
  const { bytes, contentType } = await fetchExternalImage(url);
  const presigned = await presignProductPhotos([
    { filename, mimeType: contentType, sizeBytes: bytes.length },
  ]);
  if (!presigned.ok) throw new Error(presigned.message);
  const [{ r2Key, uploadUrl }] = presigned.data;
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: new Uint8Array(bytes),
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) throw new Error("이미지 업로드에 실패했습니다.");
  return r2Key;
}
