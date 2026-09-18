import "server-only";

import { AwsClient } from "aws4fetch";
import { env } from "@/lib/env";

// 상품·UGC 공용 클라이언트 — 자격증명 공유(2026-08-02 §결정 8), 분리는 버킷 단위
// (r2Bucket/r2UgcBucket). 운영 토큰 스코프는 두 버킷을 모두 포함해야 한다.
export const r2 = new AwsClient({
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  // R2는 "auto", AWS S3는 실제 리전(예: ap-northeast-1) — SigV4 서명 스코프에 들어간다.
  region: env.R2_REGION,
});

export const r2Endpoint = env.R2_ENDPOINT;
export const r2Bucket = env.R2_BUCKET;
export const r2PublicBase = env.R2_PUBLIC_BASE;
export const r2UgcBucket = env.R2_UGC_BUCKET;
