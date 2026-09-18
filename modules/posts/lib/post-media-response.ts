import "server-only";

import sharp from "sharp";
import { db } from "@/lib/db";
import { fetchUgcR2Object } from "@/lib/r2/get";
import { verifyPostThumbnailSignature } from "./post-media";

// ⚠️ 이 모듈만 sharp를 import한다(/media 라우트 전용). 페이지에서 import하면 SSR 번들에
// sharp가 딸려가 런타임 로드 실패 시 페이지 전체가 500난다.

const THUMB_WIDTH = 640;
const THUMB_QUALITY = 74;

const IMAGE_HEADERS = {
  "Content-Type": "image/webp",
  "Content-Disposition": 'inline; filename="iroiro-post.webp"',
  // 목록 썸네일 — 공유 캐시 허용(서명 URL이라 안전). 숨김·삭제는 아래에서 재확인.
  "Cache-Control": "private, max-age=600",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

// 서명 검증 → 사진의 소속 글이 여전히 노출 상태(미숨김·미삭제·사진 미삭제)일 때만 서빙.
// 서명은 영구값이라, 재확인이 없으면 숨김 처리된 글의 썸네일 URL이 계속 살아남는다.
export async function postThumbnailResponse(
  photoId: number,
  candidateSignature: string,
): Promise<Response> {
  if (!verifyPostThumbnailSignature(photoId, candidateSignature)) {
    return new Response(null, { status: 404 });
  }
  const rows = await db.$queryRaw<{ r2_key: string }[]>`
    SELECT ph.r2_key
    FROM post_photo ph
    JOIN post p ON p.id = ph.post_id
    WHERE ph.id = ${BigInt(photoId)}
      AND ph.deleted_at IS NULL
      AND p.hidden_at IS NULL
      AND p.deleted_at IS NULL`;
  const r2Key = rows[0]?.r2_key;
  if (!r2Key) return new Response(null, { status: 404 });

  try {
    const object = await fetchUgcR2Object(r2Key);
    const source = Buffer.from(await new Response(object.body).arrayBuffer());
    const processed = await sharp(source)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    return new Response(new Uint8Array(processed), { headers: IMAGE_HEADERS });
  } catch {
    return new Response(null, { status: 404 });
  }
}
