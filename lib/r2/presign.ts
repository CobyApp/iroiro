import "server-only";

import { v7 as uuidv7 } from "uuid";
import { r2, r2Bucket, r2Endpoint, r2PublicBase } from "./client";

export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const url = new URL(`${r2Endpoint}/${r2Bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));

  const signed = await r2.sign(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } },
  );

  return signed.url;
}

export function getPublicUrl(key: string): string {
  return `${r2PublicBase}/${key}`;
}

// 사진 R2 키. 상품 생성 *전* presign 시점에 호출되므로 productId에 의존하지 않는다.
// 종류(original)별 최상위 분리. 변형(variants)은 추후 `products/variants/{size}/{id}.{ext}`로 예약.
// 샤딩은 도입하지 않음(raw) — 이 규모에선 불필요. 필요해지면 신규 업로드부터 추가.
// 설계 근거: docs/image-path-strategy.md
export function buildR2Key(filename: string): string {
  const ext = extractExt(filename);
  const id = uuidv7();
  return `products/original/${id}.${ext}`;
}

// 공지 첨부 사진 키 — 상품과 동일 원칙(uuidv7·original 세그먼트·비샤딩).
// 설계: docs/superpowers/specs/2026-08-02-notice-photos-design.md
export function buildNoticeR2Key(filename: string): string {
  return `notices/original/${uuidv7()}.${extractExt(filename)}`;
}

function extractExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "bin";
  const ext = filename
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.length > 0 ? ext : "bin";
}
