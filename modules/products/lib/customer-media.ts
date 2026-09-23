import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ⚠️ 이 파일은 페이지·컴포넌트가 URL 생성을 위해 import한다. 절대 sharp/db 등
// 무거운 서버 모듈을 import하지 말 것 — 이미지 처리(sharp)는 customer-media-response.ts로
// 분리되어 있고, 그렇게 해야 페이지 SSR 번들에 sharp가 딸려가 500나지 않는다.

const SIGNATURE_BYTES = 18;

// 고객 노출 이미지 변형. 서명이 변형 코드까지 포함하므로 URL만으로 변형을 임의로 바꿀 수 없다.
// 상품 사진은 업로드 시 wm(워터마크)·clean(원본) 두 벌로 저장되고, 변형이 어느 벌을 읽을지 정한다.
//  g  = 그리드/목록 (작게)   — 상품 카드·마키·장바구니 등            → wm
//  d  = 상세 (크게)          — 상품 상세 갤러리·3D·OG                → wm
//  cg = 컬렉션 그리드 (작게) — 소유자 컬렉션 타일(로그인+보유 확인)   → clean
//  cd = 컬렉션 상세 (크게)   — 소유자 컬렉션 3D 뷰어(로그인+보유 확인) → clean
export const MEDIA_VARIANTS = {
  g: { width: 600, quality: 74 },
  d: { width: 1100, quality: 78 },
  cg: { width: 600, quality: 74 },
  cd: { width: 1100, quality: 80 },
} as const;

export type MediaVariant = keyof typeof MEDIA_VARIANTS;

// 소유자 전용 변형 — 응답 모듈이 세션·보유를 확인하고 clean 원본을 읽는다.
const OWNER_VARIANTS: ReadonlySet<MediaVariant> = new Set(["cg", "cd"]);
export function isOwnerVariant(variant: MediaVariant): boolean {
  return OWNER_VARIANTS.has(variant);
}

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

// 카탈로그 카드 오버레이 사진(id<=0) — 실시간 카드 앞면(cards/wm)이라 실제 product_photo 행이
// 없다. 서명 라우트(변형·소유확인) 대상이 아니라 이미 워터마크된 공개 이미지이므로 공개 베이스로
// 직접 렌더한다. r2Key 가 비면 빈 문자열(<img> fallback 처리).
type PhotoRef = { id: number; r2Key: string };
function overlayPublicUrl(r2Key: string): string {
  return r2Key ? `${env.R2_PUBLIC_BASE}/${r2Key}` : "";
}
function isOverlayPhoto(photo: PhotoRef): boolean {
  return !isPositiveInteger(photo.id);
}

// ── 공개 ────────────────────────────────────────────────────────
/** 상품 상세 갤러리·3D·OG — 크게 */
export function productDetailPhotoUrl(photoId: number): string {
  return photoUrl(photoId, "d");
}
/** 그리드/목록/마키의 개별 사진 — 작게 */
export function productGridPhotoUrl(photoId: number): string {
  return photoUrl(photoId, "g");
}
/** 그리드 사진 src — 카드 오버레이 사진(id<=0)이면 공개 베이스로, 아니면 서명 라우트로. */
export function productGridPhotoSrc(photo: PhotoRef): string {
  return isOverlayPhoto(photo) ? overlayPublicUrl(photo.r2Key) : photoUrl(photo.id, "g");
}
/** 상세 사진 src — 카드 오버레이 사진(id<=0)이면 공개 베이스로, 아니면 서명 라우트로. */
export function productDetailPhotoSrc(photo: PhotoRef): string {
  return isOverlayPhoto(photo) ? overlayPublicUrl(photo.r2Key) : photoUrl(photo.id, "d");
}
/** 컬렉션(소유자) 사진 src — 카드 오버레이 사진(id<=0)이면 공개 베이스로, 아니면 서명 라우트로. */
export function collectionPhotoSrc(photo: PhotoRef): string {
  return isOverlayPhoto(photo) ? overlayPublicUrl(photo.r2Key) : photoUrl(photo.id, "cd");
}
/** 그리드/목록/장바구니 썸네일(상품 대표) — 작게 */
export function productGridThumbnailUrl(productId: number): string {
  return thumbnailUrl(productId, "g");
}

// ── 컬렉션(소유자) ──────────────────────────────────────────────
/** 소유자 컬렉션 타일 썸네일 — 작게 */
export function collectionThumbnailUrl(productId: number): string {
  return thumbnailUrl(productId, "cg");
}
/** 소유자 컬렉션 3D 뷰어 사진 — 크게 */
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

// 소유자 컬렉션 3D 뷰어(상세) — 상품 대표 사진을 productId 기준 소유자 clean(cd)으로.
// 카드=상품 오버레이 사진은 공개(cards/wm) URL 이라 워터마크가 보였는데, 그리드가 이미 쓰는
// productId 소유자 라우트(product_photo 조회 → clean)를 상세에도 써서 동일하게 워터마크를 없앤다.
export function collectionDetailUrl(productId: number): string {
  return thumbnailUrl(productId, "cd");
}
