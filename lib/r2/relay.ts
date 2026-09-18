import "server-only";

import { DomainError } from "@/lib/action-result";
import { getSignedUploadUrl } from "./presign";

// 서버 경유 R2 업로드 — 브라우저가 presigned URL로 직접 PUT하면 버킷 CORS
// 설정이 필요한데(미설정 시 전부 차단), 서버에서 PUT하면 CORS가 없다.
// 서버 액션 바디 한도는 next.config의 serverActions.bodySizeLimit로 올려둔다.
export async function relayUploadToR2(file: Blob, r2Key: string): Promise<void> {
  const uploadUrl = await getSignedUploadUrl(r2Key, file.type, 600);
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: Buffer.from(await file.arrayBuffer()),
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new DomainError("이미지 업로드에 실패했습니다");
}
