import "server-only";

import { r2, r2CatalogBucket, r2CatalogPublicBase, r2Endpoint } from "./client";
import type { R2Object } from "./get";

// 카탈로그 버킷(dev·prd 공유) 입출력 — 카드 앞면 이미지 두 벌.
//   cards/wm/<uuid>.jpg     공개(버킷 정책 public read) — 고객 화면·미리보기
//   cards/clean/<uuid>.jpg  비공개 — 관리자 카탈로그(/media/catalog-clean)·AI 임베딩 입력
// 서버가 직접 PUT/GET 한다(브라우저 직접 접근 없음 → CORS 불필요).

function objectUrl(key: string): URL {
  return new URL(`${r2Endpoint}/${r2CatalogBucket}/${key}`);
}

export function catalogPublicUrl(key: string): string {
  return `${r2CatalogPublicBase}/${key}`;
}

export async function putCatalogObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const signed = await r2.sign(
    new Request(objectUrl(key), {
      method: "PUT",
      body: new Uint8Array(body),
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
      },
    }),
  );
  const response = await fetch(signed);
  if (!response.ok) {
    throw new Error(`catalog put failed for ${key}: ${response.status} ${response.statusText}`);
  }
}

export async function fetchCatalogObject(key: string): Promise<R2Object> {
  const signed = await r2.sign(new Request(objectUrl(key), { method: "GET" }));
  const response = await fetch(signed);
  if (!response.ok) {
    throw new Error(`catalog fetch failed for ${key}: ${response.status} ${response.statusText}`);
  }
  if (!response.body) throw new Error(`catalog fetch returned empty body for ${key}`);
  const lenStr = response.headers.get("content-length");
  const parsed = lenStr ? Number.parseInt(lenStr, 10) : null;
  return {
    body: response.body,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    contentLength: parsed !== null && Number.isFinite(parsed) ? parsed : null,
  };
}

// 멱등 삭제 — 404 도 성공.
export async function deleteCatalogObject(key: string): Promise<boolean> {
  const signed = await r2.sign(new Request(objectUrl(key), { method: "DELETE" }));
  const response = await fetch(signed);
  return response.ok || response.status === 404;
}

// 스트림 → Buffer (임베딩 입력·프록시 응답용).
export async function readObjectBytes(obj: R2Object): Promise<Buffer> {
  return Buffer.from(await new Response(obj.body).arrayBuffer());
}
