"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { buildR2Key, getPublicUrl, getSignedUploadUrl } from "@/lib/r2/presign";
import { compressImageBuffer } from "@/lib/image/compress-image";
import { relayUploadToR2 } from "@/lib/r2/relay";
import { db } from "@/lib/db";
import { isNotFoundError, isUniqueViolationOn } from "@/lib/prisma-errors";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
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
import { fetchJpyKrwRate, type ExchangeRateResult } from "./lib/fx";
import {
  planAuctionCreate,
  planAuctionUpdate,
  type AuctionPatch,
} from "@/modules/auction/lib/admin-transition";
import { SALE_STATUSES, type Product, type SaleStatus } from "./types";
import { Prisma } from "@prisma/client";

// 상품 write(create/update/delete)의 알려진 Prisma 오류를 사용자 메시지로 변환.
// - P2002 source_id unique 위반 = 이미 가져온 외부 카드
// - P2002 item_code unique 위반 = (item_code, item_type, condition) 조합 중복
// - P2025(update/delete 대상 없음) = not-found → 예상 도메인 오류로 결과화
// adapter-pg에서 meta.target이 비므로 판별은 반드시 헬퍼를 거친다(lib/prisma-errors).
async function mapProductWriteError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isUniqueViolationOn(error, "source_id")) {
      throw new DomainError("이미 등록된 카드입니다");
    }
    if (isUniqueViolationOn(error, "item_code")) {
      throw new DomainError(
        "같은 아이템 코드·구분·컨디션 조합의 상품이 이미 있습니다",
      );
    }
    if (isNotFoundError(error)) {
      throw new DomainError("상품을 찾을 수 없습니다");
    }
    throw error;
  }
}

// 매입일 환율(JPY→KRW, 100¥ 기준) 조회 — 상품 폼에서 매입일 기준 환율 자동 적용.
export async function getExchangeRateForDate(
  date: string,
): Promise<ActionResult<ExchangeRateResult>> {
  return runAction(async () => {
    // 어드민 상품 폼 전용 — 무인증 호출로 외부 환율 API를 두드리게 두지 않는다.
    await requireAdmin();
    return fetchJpyKrwRate(date);
  });
}

const PRESIGN_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function presignProductPhotos(
  files: { filename: string; mimeType: string; sizeBytes: number }[],
): Promise<ActionResult<{ r2Key: string; uploadUrl: string }[]>> {
  return runAction(async () => {
    await requireAdmin();
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
// 상세 변형(/media, 최대 1100px)보다 여유 있게 긴 변 2000px.
const PRODUCT_PHOTO_MAX_DIM = 2000;
const PRODUCT_PHOTO_QUALITY = 82;

// 서버 경유 업로드. 저장 직전에 서버가 압축(크롭 없음)하고, 저장된 객체의 URL을 미리보기용으로 돌려준다.
export async function uploadProductPhotoFile(
  formData: FormData,
): Promise<ActionResult<{ r2Key: string; previewUrl: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const file = formData.get("file");
    const filename = String(formData.get("filename") ?? "photo.jpg");
    if (!(file instanceof Blob)) throw new DomainError("파일이 없습니다");
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new DomainError(`지원하지 않는 포맷: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new DomainError(`파일 크기 초과 (5MB 이하): ${filename}`);
    }
    let compressed: Buffer;
    try {
      compressed = await compressImageBuffer(Buffer.from(await file.arrayBuffer()), {
        maxDim: PRODUCT_PHOTO_MAX_DIM,
        quality: PRODUCT_PHOTO_QUALITY,
      });
    } catch {
      throw new DomainError(`이미지를 처리할 수 없습니다: ${filename}`);
    }
    const r2Key = buildR2Key(`${filename.replace(/\.[^.]+$/, "")}.jpg`);
    await relayUploadToR2(new Blob([new Uint8Array(compressed)], { type: "image/jpeg" }), r2Key);
    return { r2Key, previewUrl: getPublicUrl(r2Key) };
  });
}

export async function createProduct(
  input: ProductCreateInput,
): Promise<ActionResult<Product>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(productCreateSchema, input);

    // 경매 상품 파생 필드 — 재고 1 고정, 정가/판매가 = 시작가, 상태 live.
    let auctionFields: AuctionPatch = {};
    if (data.saleMode === "auction") {
      const plan = planAuctionCreate(data, new Date());
      if (!plan.ok) throw new DomainError(plan.error);
      auctionFields = plan.patch;
    }

    const result = await mapProductWriteError(() => db.$transaction(async (tx) => {
      const baseCreateData = {
          itemCode: data.itemCode ?? null,
          sourceId: data.sourceId ?? null,
          itemType: data.itemType,
          teamId: data.teamId !== undefined && data.teamId !== null
            ? BigInt(data.teamId)
            : null,
          memberId: data.memberId !== undefined && data.memberId !== null
            ? BigInt(data.memberId)
            : null,
          name: data.name,
          description: data.description ?? null,
          purchasePriceJpy: data.purchasePriceJpy,
          purchaseExchangeRate: data.purchaseExchangeRate,
          purchasePriceKrw: data.purchasePriceKrw,
          packagingCostKrw: data.packagingCostKrw,
          overseasShippingKrw: data.overseasShippingKrw,
          domesticShippingKrw: data.domesticShippingKrw,
          otherCostKrw: data.otherCostKrw,
          purchaser: data.purchaser ?? null,
          purchaseDate: new Date(data.purchaseDate),
          regularPrice: data.regularPrice,
          salePrice: data.salePrice,
          condition: data.condition ?? null,
          stockQuantity: data.stockQuantity,
          saleStatus: data.saleStatus,
          saleMode: data.saleMode,
          seriesId: data.seriesId !== undefined && data.seriesId !== null
            ? BigInt(data.seriesId)
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

    revalidatePath("/admin/products");
    revalidatePath("/");
    return toProduct(result);
  });
}

export async function updateProduct(
  input: ProductUpdateInput,
): Promise<ActionResult<Product>> {
  return runAction(async () => {
    await requireAdmin();
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
    if (data.sourceId !== undefined) patch.sourceId = data.sourceId;
    if (data.itemType !== undefined) patch.itemType = data.itemType;
    if (data.teamId !== undefined)
      patch.teamId = data.teamId !== null ? BigInt(data.teamId) : null;
    if (data.memberId !== undefined)
      patch.memberId = data.memberId !== null ? BigInt(data.memberId) : null;
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.purchasePriceJpy !== undefined)
      patch.purchasePriceJpy = data.purchasePriceJpy;
    if (data.purchaseExchangeRate !== undefined)
      patch.purchaseExchangeRate = data.purchaseExchangeRate;
    if (data.purchasePriceKrw !== undefined)
      patch.purchasePriceKrw = data.purchasePriceKrw;
    if (data.packagingCostKrw !== undefined)
      patch.packagingCostKrw = data.packagingCostKrw;
    if (data.overseasShippingKrw !== undefined)
      patch.overseasShippingKrw = data.overseasShippingKrw;
    if (data.domesticShippingKrw !== undefined)
      patch.domesticShippingKrw = data.domesticShippingKrw;
    if (data.otherCostKrw !== undefined) patch.otherCostKrw = data.otherCostKrw;
    if (data.purchaser !== undefined) patch.purchaser = data.purchaser;
    if (data.purchaseDate !== undefined)
      patch.purchaseDate = new Date(data.purchaseDate);
    if (data.regularPrice !== undefined) patch.regularPrice = data.regularPrice;
    if (data.salePrice !== undefined) patch.salePrice = data.salePrice;
    if (data.condition !== undefined) patch.condition = data.condition;
    if (data.stockQuantity !== undefined)
      patch.stockQuantity = data.stockQuantity;
    if (data.saleStatus !== undefined) patch.saleStatus = data.saleStatus;

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

    revalidatePath("/admin/products");
    revalidatePath(`/products/${data.id}`);
    revalidatePath("/");
    return toProduct(result);
  });
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    await mapProductWriteError(() =>
      db.$transaction(async (tx) => {
        await tx.productPhoto.deleteMany({ where: { productId: BigInt(id) } });
        await tx.product.delete({ where: { id: BigInt(id) } });
      }),
    );

    revalidatePath("/admin/products");
    revalidatePath("/");
  });
}

// 선택 상품 일괄 수정 — 상태·재고·판매가. 판매가 인상 시 정가를 먼저 끌어올린다.
export async function bulkUpdateProducts(
  ids: number[],
  patch: { saleStatus?: SaleStatus; stockQuantity?: number; salePrice?: number },
): Promise<ActionResult<{ updated: number }>> {
  return runAction(async () => {
    await requireAdmin();

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

    revalidatePath("/admin/products");
    revalidatePath("/admin/settlement");
    revalidatePath("/");
    return { updated: uniqueIds.length };
  });
}

// 같은 카드로 새 매물 만들기 — 원본 상품을 사진까지 복제해 초안으로 등록한다.
// 컨디션·판매방식·가격은 새 매물 편집에서 바꾼다(별개 매물 = 별도 product 행).
export async function duplicateProductAsListing(
  productId: number,
): Promise<{ id: number }> {
  await requireAdmin();

  const src = await db.product.findUnique({ where: { id: BigInt(productId) } });
  if (!src) throw new Error("원본 상품을 찾을 수 없습니다.");
  const photos = await db.productPhoto.findMany({
    where: { productId: src.id },
    orderBy: { displayOrder: "asc" },
  });

  const row = await db.$transaction(async (tx) => {
    const {
      id: _id,
      createdAt: _c,
      updatedAt: _u,
      createdBy: _cb,
      updatedBy: _ub,
      ...rest
    } = src;
    const created = await tx.product.create({
      data: {
        ...rest,
        // 새 매물은 초안·고정가·재고 0으로 시작 — 경매 상태는 복제하지 않는다.
        saleStatus: "draft",
        saleMode: "fixed",
        stockQuantity: 0,
        auctionStartPrice: null,
        auctionCurrentPrice: null,
        auctionBidCount: 0,
        auctionEndsAt: null,
        auctionStatus: null,
        auctionWinnerAccountId: null,
        auctionPayDueAt: null,
      },
    });
    if (photos.length > 0) {
      await tx.productPhoto.createMany({
        data: photos.map((p) => ({
          productId: created.id,
          r2Key: p.r2Key,
          altText: p.altText,
          displayOrder: p.displayOrder,
          isThumbnail: p.isThumbnail,
        })),
      });
    }
    return created;
  });

  revalidatePath("/admin/products");
  return { id: Number(row.id) };
}
