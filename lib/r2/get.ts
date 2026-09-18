import "server-only";

import { r2, r2Bucket, r2Endpoint, r2UgcBucket } from "./client";

export type R2Object = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
};

export async function fetchR2Object(r2Key: string): Promise<R2Object> {
  return fetchFromBucket(r2Bucket, r2Key);
}

// UGC(게시판 사진) 비공개 버킷 읽기 — 썸네일 프록시 전용.
export async function fetchUgcR2Object(r2Key: string): Promise<R2Object> {
  return fetchFromBucket(r2UgcBucket, r2Key);
}

async function fetchFromBucket(bucket: string, r2Key: string): Promise<R2Object> {
  const url = new URL(`${r2Endpoint}/${bucket}/${r2Key}`);
  const signed = await r2.sign(new Request(url, { method: "GET" }));
  const response = await fetch(signed);

  if (!response.ok) {
    throw new Error(
      `R2 fetch failed for ${r2Key}: ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error(`R2 fetch returned empty body for ${r2Key}`);
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const lenStr = response.headers.get("content-length");
  const parsed = lenStr ? Number.parseInt(lenStr, 10) : null;
  const contentLength =
    parsed !== null && Number.isFinite(parsed) ? parsed : null;

  return { body: response.body, contentType, contentLength };
}
