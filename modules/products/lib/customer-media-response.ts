import "server-only";

import { db } from "@/lib/db";
import { fetchR2Object } from "@/lib/r2/get";
import { getCurrentAccount } from "@/modules/auth/dal";
import { ownsProduct } from "@/modules/collection/lib/queries";
import { processProductImage } from "./watermark";
import { fetchProductPhotoOriginal } from "./photo-source";
import {
  MEDIA_VARIANTS,
  isMediaVariant,
  isOwnerVariant,
  verifyCustomerMediaSignature,
  type MediaKind,
} from "./customer-media";

// ⚠️ 이 모듈만 sharp(watermark)를 import한다. /media 라우트 핸들러 전용 —
// 페이지·컴포넌트에서 import하면 sharp가 SSR 번들에 딸려가 런타임 로드 실패 시
// 페이지 전체가 500난다(그래서 URL 생성은 customer-media.ts로 분리).
//
// 두 벌 원칙: 공개 변형(g/d)은 저장된 wm 객체(products/original)를, 소유자 컬렉션 변형(cg/cd)은
// 로그인 + 보유 확인 뒤 clean 원본(products/clean, 없으면 wm 폴백)을 리사이즈해 준다.

async function findPhoto(
  kind: MediaKind,
  id: number,
): Promise<{ r2Key: string; productId: number } | null> {
  if (kind === "photo") {
    const photo = await db.productPhoto.findUnique({
      where: { id: BigInt(id) },
      select: { r2Key: true, productId: true },
    });
    return photo ? { r2Key: photo.r2Key, productId: Number(photo.productId) } : null;
  }

  const photo = await db.productPhoto.findFirst({
    where: { productId: BigInt(id) },
    select: { r2Key: true, productId: true },
    orderBy: [{ isThumbnail: "desc" }, { displayOrder: "asc" }],
  });
  return photo ? { r2Key: photo.r2Key, productId: Number(photo.productId) } : null;
}

const BASE_HEADERS = {
  "Content-Type": "image/webp",
  "Content-Disposition": 'inline; filename="iroiro-card.webp"',
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

const PUBLIC_CACHE =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
// 소유자 원본은 계정에 묶인 응답 — 공유 캐시 금지.
const OWNER_CACHE = "private, max-age=3600";

export async function customerProductImageResponse(
  kind: MediaKind,
  id: number,
  variant: string,
  candidateSignature: string,
): Promise<Response> {
  if (!isMediaVariant(variant)) return new Response(null, { status: 404 });
  if (!verifyCustomerMediaSignature(kind, id, variant, candidateSignature)) {
    return new Response(null, { status: 404 });
  }

  const photo = await findPhoto(kind, id);
  if (!photo) return new Response(null, { status: 404 });

  const owner = isOwnerVariant(variant);
  if (owner) {
    // 소유자 변형은 URL 을 알아도 보유자만 — 세션 + 활성 보유 확인. 존재 여부는 비노출(404).
    const account = await getCurrentAccount().catch(() => null);
    if (!account || !(await ownsProduct(account.id, photo.productId))) {
      return new Response(null, { status: 404 });
    }
  }

  try {
    const object = owner
      ? await fetchProductPhotoOriginal(photo.r2Key)
      : await fetchR2Object(photo.r2Key);
    const source = Buffer.from(await new Response(object.body).arrayBuffer());
    const processed = await processProductImage(source, MEDIA_VARIANTS[variant]);
    return new Response(new Uint8Array(processed), {
      headers: { ...BASE_HEADERS, "Cache-Control": owner ? OWNER_CACHE : PUBLIC_CACHE },
    });
  } catch {
    // 객체 키·스토리지 응답·이미지 디코딩 오류를 외부에 구분해서 노출하지 않는다.
    return new Response(null, { status: 404 });
  }
}
