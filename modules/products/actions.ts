"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { buildR2Key, getPublicUrl, getSignedUploadUrl } from "@/lib/r2/presign";
import { compressImageVariants } from "@/lib/image/compress-image";
import { productCleanKey } from "./lib/photo-keys";
import { relayUploadToR2 } from "@/lib/r2/relay";
import { db } from "@/lib/db";
import { isNotFoundError, isUniqueViolationOn } from "@/lib/prisma-errors";
import { requireCatalogManager, requireDeliveryManager } from "@/modules/admin/lib/requireAdminSpace";
import {
  detectWishlistEvents,
  notifyWishers,
} from "@/modules/wishlist/lib/alerts";
import {
  productCreateSchema,
  productUpdateSchema,
  type ProductCreateInput,
  type ProductUpdateInput,
} from "./lib/schema";
import { toProduct } from "./lib/transform";
import { fetchJpyKrwRate } from "./lib/fx";
import { buildDraftProductFromCard } from "./lib/build-draft-from-card";
import { todayKstYmd } from "@/lib/datetime";
import {
  planAuctionCreate,
  planAuctionUpdate,
  type AuctionPatch,
} from "@/modules/auction/lib/admin-transition";
import { SALE_STATUSES, type Product, type SaleStatus } from "./types";
import { Prisma } from "@prisma/client";

// 상품 write(create/update/delete)의 알려진 Prisma 오류를 사용자 메시지로 변환.
// - P2002 item_code unique 위반 = (item_code, item_type, condition) 조합 중복
// - P2025(update/delete 대상 없음) = not-found → 예상 도메인 오류로 결과화
// adapter-pg에서 meta.target이 비므로 판별은 반드시 헬퍼를 거친다(lib/prisma-errors).
async function mapProductWriteError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolationOn(error, "item_code")) {
      throw new DomainError("같은 아이템 코드·구분의 상품이 이미 있습니다");
    }
    if (isNotFoundError(error)) {
      throw new DomainError("상품을 찾을 수 없습니다");
    }
    throw error;
  }
}


const PRESIGN_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function presignProductPhotos(
  files: { filename: string; mimeType: string; sizeBytes: number }[],
): Promise<ActionResult<{ r2Key: string; uploadUrl: string }[]>> {
  return runAction(async () => {
    await requireDeliveryManager();
    if (files.length === 0) throw new DomainError("파일이 없습니다");
    if (files.length > 10) throw new DomainError("상품당 최대 10장");

    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.mimeType)) {
        throw new DomainError(`지원하지 않는 포맷: ${file.mimeType}`);
      }
      if (file.sizeBytes > MAX_FILE_BYTES) {
        throw new DomainError(`파일 크기 초과 (5MB 이하): ${file.filename}`);
      }
    }

    return Promise.all(
      files.map(async (file) => {
        const r2Key = buildR2Key(file.filename);
        const uploadUrl = await getSignedUploadUrl(
          r2Key,
          file.mimeType,
          PRESIGN_TTL_SECONDS,
        );
        return { r2Key, uploadUrl };
      }),
    );
  });
}

// 저장 규격 — Card(oshikore-card) compress_image 방식(크롭 없음·비율 유지·progressive JPEG).
// 상세 변형(/media, 최대 1100px)보다 여유 있게 긴 변 2000px. 저장 시 clean(원본)·wm(워터마크)
// 두 벌을 만든다 — 고객 화면은 wm, 소유자 컬렉션·관리자 다운로드는 clean(products/lib/photo-keys).
const PRODUCT_PHOTO_MAX_DIM = 2000;
const PRODUCT_PHOTO_QUALITY = 78;

// 서버 경유 업로드. 저장 직전에 서버가 압축(크롭 없음)하고, 저장된 wm 객체의 URL을 미리보기용으로 돌려준다.
export async function uploadProductPhotoFile(
  formData: FormData,
): Promise<ActionResult<{ r2Key: string; previewUrl: string }>> {
  return runAction(async () => {
    await requireDeliveryManager();
    const file = formData.get("file");
    const filename = String(formData.get("filename") ?? "photo.jpg");
    if (!(file instanceof Blob)) throw new DomainError("파일이 없습니다");
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new DomainError(`지원하지 않는 포맷: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new DomainError(`파일 크기 초과 (5MB 이하): ${filename}`);
    }
    let variants: { clean: Buffer; wm: Buffer };
    try {
      variants = await compressImageVariants(Buffer.from(await file.arrayBuffer()), {
        maxDim: PRODUCT_PHOTO_MAX_DIM,
        quality: PRODUCT_PHOTO_QUALITY,
      });
    } catch {
      throw new DomainError(`이미지를 처리할 수 없습니다: ${filename}`);
    }
    const r2Key = buildR2Key(`${filename.replace(/\.[^.]+$/, "")}.jpg`);
    const cleanKey = productCleanKey(r2Key)!;
    await Promise.all([
      relayUploadToR2(new Blob([new Uint8Array(variants.wm)], { type: "image/jpeg" }), r2Key),
      relayUploadToR2(new Blob([new Uint8Array(variants.clean)], { type: "image/jpeg" }), cleanKey),
    ]);
    return { r2Key, previewUrl: getPublicUrl(r2Key) };
  });
}

// 상품 1건을 검증·삽입하고 Prisma 행을 반환한다(requireAdmin·revalidate 없음).
// createProduct(단건)와 createDraftProductForCard(카탈로그 자동 생성)가 공유한다.
async function persistNewProduct(input: ProductCreateInput) {
  const data = parseActionInput(productCreateSchema, input);

  // 같은 카탈로그 카드로 이미 등록된 상품이 있으면 중복 등록 차단(카드당 상품 1개).
  // 일괄 등록은 사전에 등록된 카드를 건너뛰지만, 단건·경쟁 상황의 백스톱.
  if (data.catalogCardId != null) {
    const dup = await db.product.findFirst({
      where: { catalogCardId: BigInt(data.catalogCardId) },
      select: { id: true },
    });
    if (dup) throw new DomainError("이미 이 카드로 등록된 상품이 있어요");
  }

  // 경매 상품 파생 필드 — 재고 1 고정, 정가/판매가 = 시작가, 상태 live.
  let auctionFields: AuctionPatch = {};
  if (data.saleMode === "auction") {
    const plan = planAuctionCreate(data, new Date());
    if (!plan.ok) throw new DomainError(plan.error);
    auctionFields = plan.patch;
  }

  return mapProductWriteError(() => db.$transaction(async (tx) => {
      const baseCreateData = {
          itemCode: data.itemCode ?? null,
          itemType: data.itemType,
          teamId: data.teamId !== undefined && data.teamId !== null
            ? BigInt(data.teamId)
            : null,
          memberId: data.memberId !== undefined && data.memberId !== null
            ? BigInt(data.memberId)
            : null,
          name: data.name,
          regularPrice: data.regularPrice,
          salePrice: data.salePrice,
          stockQuantity: data.stockQuantity,
          saleStatus: data.saleStatus,
          saleMode: data.saleMode,
          seriesId: data.seriesId !== undefined && data.seriesId !== null
            ? BigInt(data.seriesId)
            : null,
          catalogCardId: data.catalogCardId !== undefined && data.catalogCardId !== null
            ? BigInt(data.catalogCardId)
            : null,
          marketAvgJpy: data.marketAvgJpy ?? 0,
          marketMinJpy: data.marketMinJpy ?? 0,
          marketMaxJpy: data.marketMaxJpy ?? 0,
          marketSoldCount: data.marketSoldCount ?? 0,
          retailPriceJpy: data.retailPriceJpy ?? 0,
      };
      const productRow = await tx.product.create({
        data: { ...baseCreateData, ...auctionFields },
      });

      if (data.photos.length > 0) {
        await tx.productPhoto.createMany({
          data: data.photos.map((photo, index) => ({
            productId: productRow.id,
            r2Key: photo.r2Key,
            altText: photo.altText ?? null,
            displayOrder: photo.displayOrder ?? index,
            isThumbnail: photo.isThumbnail,
          })),
        });
      }

      return productRow;
  }));
}

export async function createProduct(
  input: ProductCreateInput,
): Promise<ActionResult<Product>> {
  return runAction(async () => {
    await requireDeliveryManager();
    const result = await persistNewProduct(input);
    revalidatePath("/delivery/products");
    revalidatePath("/");
    return toProduct(result);
  });
}

export async function updateProduct(
  input: ProductUpdateInput,
): Promise<ActionResult<Product>> {
  return runAction(async () => {
    await requireDeliveryManager();
    const data = parseActionInput(productUpdateSchema, input);

    // 찜 알림 판정용 수정 전 스냅샷 — 가격 인하·재입고·경매 시작 감지.
    const beforeRow = await db.product.findUnique({
      where: { id: BigInt(data.id) },
      select: {
        name: true,
        salePrice: true,
        stockQuantity: true,
        saleStatus: true,
        saleMode: true,
        auctionStatus: true,
      },
    });
    if (!beforeRow) throw new DomainError("상품을 찾을 수 없습니다");

    const patch: Prisma.ProductUpdateInput = {
      updatedAt: new Date(),
    };
    if (data.itemCode !== undefined) patch.itemCode = data.itemCode;
    if (data.itemType !== undefined) patch.itemType = data.itemType;
    if (data.teamId !== undefined)
      patch.teamId = data.teamId !== null ? BigInt(data.teamId) : null;
    if (data.memberId !== undefined)
      patch.memberId = data.memberId !== null ? BigInt(data.memberId) : null;
    if (data.name !== undefined) patch.name = data.name;
    if (data.regularPrice !== undefined) patch.regularPrice = data.regularPrice;
    if (data.salePrice !== undefined) patch.salePrice = data.salePrice;
    if (data.stockQuantity !== undefined)
      patch.stockQuantity = data.stockQuantity;
    if (data.saleStatus !== undefined) patch.saleStatus = data.saleStatus;
    if (data.catalogCardId !== undefined)
      patch.catalogCardId = data.catalogCardId !== null ? BigInt(data.catalogCardId) : null;

    // 경매 필드 전이 — 기존 상태 기반 검증(시작가 잠금·재경매 초기화 등)은
    // planAuctionUpdate가 담당. 반환 패치가 stockQuantity/가격을 덮을 수 있다.
    if (
      data.saleMode !== undefined ||
      data.auctionStartPrice !== undefined ||
      data.auctionEndsAt !== undefined
    ) {
      const existing = await db.product.findUnique({
        where: { id: BigInt(data.id) },
        select: {
          saleMode: true,
          auctionStatus: true,
          auctionStartPrice: true,
          auctionBidCount: true,
          auctionEndsAt: true,
          regularPrice: true,
        },
      });
      if (!existing) throw new DomainError("상품을 찾을 수 없습니다");
      const plan = planAuctionUpdate(existing, data, new Date());
      if (!plan.ok) throw new DomainError(plan.error);
      Object.assign(patch, plan.patch);
    }

    const result = await mapProductWriteError(() => db.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: BigInt(data.id) },
        data: patch,
      });

      if (data.photos) {
        await tx.productPhoto.deleteMany({
          where: { productId: BigInt(data.id) },
        });
        if (data.photos.length > 0) {
          await tx.productPhoto.createMany({
            data: data.photos.map((photo, index) => ({
              productId: BigInt(data.id),
              r2Key: photo.r2Key,
              altText: photo.altText ?? null,
              displayOrder: photo.displayOrder ?? index,
              isThumbnail: photo.isThumbnail,
            })),
          });
        }
      }

      return updated;
    }));

    // 찜 알림 — 커밋 후 best-effort. 실패해도 수정 흐름엔 영향 없음.
    const events = detectWishlistEvents(result.name, beforeRow, {
      salePrice: result.salePrice,
      stockQuantity: result.stockQuantity,
      saleStatus: result.saleStatus,
      saleMode: result.saleMode,
      auctionStatus: result.auctionStatus,
    });
    await notifyWishers(data.id, events).catch((error) =>
      console.error("[products] 찜 알림 발송 실패", error),
    );

    revalidatePath("/delivery/products");
    revalidatePath(`/products/${data.id}`);
    revalidatePath("/");
    return toProduct(result);
  });
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireDeliveryManager();
    await mapProductWriteError(() =>
      db.$transaction(async (tx) => {
        await tx.productPhoto.deleteMany({ where: { productId: BigInt(id) } });
        await tx.product.delete({ where: { id: BigInt(id) } });
      }),
    );

    revalidatePath("/delivery/products");
    revalidatePath("/");
  });
}

// 선택 상품 일괄 수정 — 상태·재고·판매가. 판매가 인상 시 정가를 먼저 끌어올린다.
export async function bulkUpdateProducts(
  ids: number[],
  patch: { saleStatus?: SaleStatus; stockQuantity?: number; salePrice?: number },
): Promise<ActionResult<{ updated: number }>> {
  return runAction(async () => {
    await requireDeliveryManager();

    const uniqueIds = Array.from(
      new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    );
    if (uniqueIds.length === 0) throw new DomainError("선택된 상품이 없습니다");

    if (
      patch.saleStatus === undefined &&
      patch.stockQuantity === undefined &&
      patch.salePrice === undefined
    ) {
      throw new DomainError("변경할 항목이 없습니다");
    }
    if (
      patch.saleStatus !== undefined &&
      !SALE_STATUSES.includes(patch.saleStatus)
    ) {
      throw new DomainError("잘못된 판매 상태입니다");
    }
    if (
      patch.stockQuantity !== undefined &&
      (!Number.isInteger(patch.stockQuantity) || patch.stockQuantity < 0)
    ) {
      throw new DomainError("재고는 0 이상의 정수여야 합니다");
    }
    if (
      patch.salePrice !== undefined &&
      (!Number.isInteger(patch.salePrice) || patch.salePrice < 0)
    ) {
      throw new DomainError("판매가는 0 이상의 정수여야 합니다");
    }

    const where = { id: { in: uniqueIds.map((id) => BigInt(id)) } };
    const now = new Date();

    if (patch.salePrice !== undefined) {
      // 정가가 새 판매가보다 낮은 행은 정가를 먼저 끌어올려 CHECK 위반 방지.
      await db.product.updateMany({
        where: { ...where, regularPrice: { lt: patch.salePrice } },
        data: { regularPrice: patch.salePrice, updatedAt: now },
      });
      await db.product.updateMany({
        where,
        data: { salePrice: patch.salePrice, updatedAt: now },
      });
    }

    const data: Prisma.ProductUpdateManyMutationInput = {};
    if (patch.saleStatus !== undefined) data.saleStatus = patch.saleStatus;
    if (patch.stockQuantity !== undefined) {
      data.stockQuantity = patch.stockQuantity;
    }
    if (Object.keys(data).length > 0) {
      data.updatedAt = now;
      await db.product.updateMany({ where, data });
    }

    revalidatePath("/delivery/products");
    revalidatePath("/");
    return { updated: uniqueIds.length };
  });
}

// 카탈로그 카드 1장을 임시저장(draft) 상품으로 자동 생성 — 카드 등록/승인 시점에서 호출.
// 카탈로그가 곧 상품: 새 카드가 생기면 상품 목록에 draft 로 자동 편입되고, 관리자가 가격·재고를 채워 공개한다.
// 이미 등록됐거나 이미지가 없으면 조용히 건너뛴다(카드 생성 자체는 막지 않는다).
export async function createDraftProductForCard(
  cardId: number,
): Promise<ActionResult<{ created: boolean }>> {
  return runAction(async () => {
    await requireCatalogManager();
    const { getCardById } = await import("@/modules/cards/lib/queries");

    const existing = await db.product.findFirst({
      where: { catalogCardId: BigInt(cardId) },
      select: { id: true },
    });
    if (existing) return { created: false };

    const card = await getCardById(cardId);
    if (!card || !card.frontR2Key) return { created: false };

    // 판매가는 오늘 환율×정가로 제안(실패 시 0=미정). 관리자가 목록에서 채운다.
    let rate100 = 0;
    try {
      rate100 = (await fetchJpyKrwRate(todayKstYmd())).rate;
    } catch {
      rate100 = 0;
    }

    // 카드 이미지를 복사하지 않고 그대로 참조한다(카드=상품, 실시간). 카드 앞면 키는 products
    // 버킷 cards/wm 에 있어 상품 사진과 같은 공개 베이스로 렌더된다. 목록·상세는 overlayCardDisplay
    // 가 항상 card.front_r2_key 로 덮어써 카탈로그 이미지 교체가 즉시 반영된다.
    const photoR2Key = card.frontR2Key;
    const draft = buildDraftProductFromCard(
      {
        id: card.id,
        itemCode: card.itemCode,
        itemType: card.itemType,
        teamId: card.teamId,
        memberId: card.memberId,
        seriesId: card.seriesId,
        name: card.name,
        retailPriceJpy: card.retailPriceJpy,
      },
      { rate100, useRateForSalePrice: rate100 > 0, photoR2Key },
    );
    await persistNewProduct(draft);
    revalidatePath("/delivery/products");
    return { created: true };
  });
}

