import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ⚠️ 이 파일은 페이지·컴포넌트가 URL 생성을 위해 import한다. 절대 sharp/db 등
// 무거운 서버 모듈을 import하지 말 것 — 이미지 처리(sharp)는 customer-media-response.ts로
// 분리되어 있고, 그렇게 해야 페이지 SSR 번들에 sharp가 딸려가 500나지 않는다.

const SIGNATURE_BYTES = 18;

// 고객 노출 이미지 변형. 서명이 변형 코드까지 포함하므로 URL만으로 워터마크·
// 해상도를 임의로 바꿀 수 없다.
//  g  = 그리드/목록 (작게, 워터마크)         — 상품 카드·마키·장바구니 등
//  d  = 상세 (크게, 워터마크)                — 상품 상세 갤러리·3D·OG
//  cg = 컬렉션 그리드 (작게, 워터마크 없음)   — 소유자 컬렉션 타일
//  cd = 컬렉션 상세 (크게, 워터마크 없음)     — 소유자 컬렉션 3D 뷰어
export const MEDIA_VARIANTS = {
  g: { width: 600, watermark: true, quality: 78 },
  d: { width: 1100, watermark: true, quality: 82 },
  cg: { width: 600, watermark: false, quality: 80 },
  cd: { width: 1100, watermark: false, quality: 84 },
} as const;

export type MediaVariant = keyof typeof MEDIA_VARIANTS;

export type MediaKind = "photo" | "thumbnail";

export function isMediaVariant(value: string): value is MediaVariant {
  return Object.prototype.hasOwnProperty.call(MEDIA_VARIANTS, value);
}

function signature(kind: MediaKind, id: number, variant: MediaVariant): string {
  return createHmac("sha256", env.R2_SECRET_ACCESS_KEY)
    // 버전(v3) — 서명 페이로드에 변형 코드 포함. 스킴 변경 시 버전을 올린다.
    .update(`iroiro:customer-product-media:v3:${kind}:${id}:${variant}`)
    .digest("base64url")
    .slice(0, (SIGNATURE_BYTES * 4) / 3);
}

function isPositiveInteger(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

function photoUrl(photoId: number, variant: MediaVariant): string {
  if (!isPositiveInteger(photoId)) throw new Error("Invalid product photo id");
  return `/media/product-photos/${photoId}/${variant}/${signature("photo", photoId, variant)}`;
}

function thumbnailUrl(productId: number, variant: MediaVariant): string {
  if (!isPositiveInteger(productId)) throw new Error("Invalid product id");
  return `/media/product-thumbnails/${productId}/${variant}/${signature("thumbnail", productId, variant)}`;
}

// ── 공개(워터마크) ──────────────────────────────────────────────
/** 상품 상세 갤러리·3D·OG — 크게 + 워터마크 */
export function productDetailPhotoUrl(photoId: number): string {
  return photoUrl(photoId, "d");
}
/** 그리드/목록/마키의 개별 사진 — 작게 + 워터마크 */
export function productGridPhotoUrl(photoId: number): string {
  return photoUrl(photoId, "g");
}
/** 그리드/목록/장바구니 썸네일(상품 대표) — 작게 + 워터마크 */
export function productGridThumbnailUrl(productId: number): string {
  return thumbnailUrl(productId, "g");
}

// ── 컬렉션(소유자, 워터마크 없음) ───────────────────────────────
/** 소유자 컬렉션 타일 썸네일 — 작게 + 워터마크 없음 */
export function collectionThumbnailUrl(productId: number): string {
  return thumbnailUrl(productId, "cg");
}
/** 소유자 컬렉션 3D 뷰어 사진 — 크게 + 워터마크 없음 */
export function collectionPhotoUrl(photoId: number): string {
  return photoUrl(photoId, "cd");
}

export function verifyCustomerMediaSignature(
  kind: MediaKind,
  id: number,
  variant: MediaVariant,
  candidate: string,
): boolean {
  if (!isPositiveInteger(id)) return false;
  const expected = signature(kind, id, variant);
  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(candidate);
  return (
    expectedBytes.length === candidateBytes.length &&
    timingSafeEqual(expectedBytes, candidateBytes)
  );
}
