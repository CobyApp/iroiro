import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ⚠️ URL 생성·서명 검증만. sharp·db는 절대 import하지 않는다(페이지 SSR 번들 분리).
// 게시판 사진 목록 썸네일 프록시 — 비공개 UGC 원본을 sharp로 축소해 서빙한다.
// (상세는 여전히 서명 GET(TTL 15분)로 원본을 준다. 목록만 이 프록시를 쓴다.)

const SIGNATURE_BYTES = 18;

function signature(photoId: number): string {
  return createHmac("sha256", env.R2_SECRET_ACCESS_KEY)
    .update(`iroiro:post-photo-thumb:v1:${photoId}`)
    .digest("base64url")
    .slice(0, (SIGNATURE_BYTES * 4) / 3);
}

export function postThumbnailUrl(photoId: number): string {
  if (!Number.isSafeInteger(photoId) || photoId <= 0) {
    throw new Error("Invalid post photo id");
  }
  return `/media/post-photos/${photoId}/${signature(photoId)}`;
}

export function verifyPostThumbnailSignature(
  photoId: number,
  candidate: string,
): boolean {
  if (!Number.isSafeInteger(photoId) || photoId <= 0) return false;
  const expected = Buffer.from(signature(photoId));
  const given = Buffer.from(candidate);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
