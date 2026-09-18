import "server-only";

import { db } from "@/lib/db";
import { fetchR2Object } from "@/lib/r2/get";
import { processProductImage } from "./watermark";
import {
  MEDIA_VARIANTS,
  isMediaVariant,
  verifyCustomerMediaSignature,
  type MediaKind,
} from "./customer-media";

// ⚠️ 이 모듈만 sharp(watermark)를 import한다. /media 라우트 핸들러 전용 —
// 페이지·컴포넌트에서 import하면 sharp가 SSR 번들에 딸려가 런타임 로드 실패 시
// 페이지 전체가 500난다(그래서 URL 생성은 customer-media.ts로 분리).

async function findR2Key(kind: MediaKind, id: number): Promise<string | null> {
  if (kind === "photo") {
    const photo = await db.productPhoto.findUnique({
      where: { id: BigInt(id) },
      select: { r2Key: true },
    });
    return photo?.r2Key ?? null;
  }

  const photo = await db.productPhoto.findFirst({
    where: { productId: BigInt(id) },
    select: { r2Key: true },
    orderBy: [{ isThumbnail: "desc" }, { displayOrder: "asc" }],
  });
  return photo?.r2Key ?? null;
}

const IMAGE_HEADERS = {
  "Content-Type": "image/webp",
  "Content-Disposition": 'inline; filename="iroiro-card.webp"',
  "Cache-Control":
    "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

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

  const r2Key = await findR2Key(kind, id);
  if (!r2Key) return new Response(null, { status: 404 });

  try {
    const object = await fetchR2Object(r2Key);
    const source = Buffer.from(await new Response(object.body).arrayBuffer());
    const processed = await processProductImage(source, MEDIA_VARIANTS[variant]);
    return new Response(new Uint8Array(processed), { headers: IMAGE_HEADERS });
  } catch {
    // 객체 키·스토리지 응답·이미지 디코딩 오류를 외부에 구분해서 노출하지 않는다.
    return new Response(null, { status: 404 });
  }
}
