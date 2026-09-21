"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { buildR2Key, getPublicUrl, getSignedUploadUrl } from "@/lib/r2/presign";
import { compressImageBuffer } from "@/lib/image/compress-image";
import { relayUploadToR2 } from "@/lib/r2/relay";
import { evaluateBid, payDueFrom } from "@/modules/auction/lib/rules";
import { getSiteSettings } from "@/modules/site-settings/lib/queries";
import { calcUsedTradeFees, mockPostTrackingCode } from "./lib/fees";
import {
  usedBuySchema,
  usedListingCreateSchema,
  type UsedBuyInput,
  type UsedListingCreateInput,
} from "./lib/schema";

const PRESIGN_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

async function requireLogin() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
  return account;
}


function revalidateUsed(listingId?: number) {
  revalidatePath("/used");
  if (listingId) revalidatePath(`/used/${listingId}`);
  revalidatePath("/mypage");
}

// 판매자 사진 업로드 presign — 로그인 유저 누구나(자기 매물 사진).
export async function presignUsedPhotos(
  files: { filename: string; mimeType: string; sizeBytes: number }[],
): Promise<ActionResult<{ r2Key: string; uploadUrl: string }[]>> {
  return runAction(async () => {
    await requireLogin();
    if (files.length === 0) throw new DomainError("파일이 없습니다");
    if (files.length > 8) throw new DomainError("매물당 최대 8장");
    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.mimeType)) {
        throw new DomainError(`지원하지 않는 포맷: ${file.mimeType}`);
      }
      if (file.sizeBytes > MAX_FILE_BYTES) {
        throw new DomainError(`파일 크기 초과 (8MB 이하): ${file.filename}`);
      }
    }
    return Promise.all(
      files.map(async (file) => {
        const r2Key = buildR2Key(file.filename).replace(
          "products/original/",
          "used/original/",
        );
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

// 저장 규격 — Card(oshikore-card) 매물 스냅샷과 같은 방식(크롭 없음·비율 유지). 판매자 사진은
// 포장·배경이 구도의 일부라 자르지 않는다. 갤러리 확대를 위해 긴 변 1600px.
const USED_PHOTO_MAX_DIM = 1600;
const USED_PHOTO_QUALITY = 82;

// 서버 경유 업로드. 저장 직전에 서버가 압축(크롭 없음)하고, 저장된 객체의 URL을 미리보기용으로 돌려준다.
export async function uploadUsedPhotoFile(
  formData: FormData,
): Promise<ActionResult<{ r2Key: string; previewUrl: string }>> {
  return runAction(async () => {
    await requireLogin();
    const file = formData.get("file");
    const filename = String(formData.get("filename") ?? "photo.jpg");
    if (!(file instanceof Blob)) throw new DomainError("파일이 없습니다");
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new DomainError(`지원하지 않는 포맷: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new DomainError(`파일 크기 초과 (8MB 이하): ${filename}`);
    }
    let compressed: Buffer;
    try {
      compressed = await compressImageBuffer(Buffer.from(await file.arrayBuffer()), {
        maxDim: USED_PHOTO_MAX_DIM,
        quality: USED_PHOTO_QUALITY,
      });
    } catch {
      throw new DomainError(`이미지를 처리할 수 없습니다: ${filename}`);
    }
    const r2Key = buildR2Key(`${filename.replace(/\.[^.]+$/, "")}.jpg`).replace(
      "products/original/",
      "used/original/",
    );
    await relayUploadToR2(new Blob([new Uint8Array(compressed)], { type: "image/jpeg" }), r2Key);
    return { r2Key, previewUrl: getPublicUrl(r2Key) };
  });
}

// 매물 등록 — 고정가/경매. 경매는 등록 즉시 live.
export async function createUsedListing(
  input: UsedListingCreateInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const data = usedListingCreateSchema.parse(input);

    // 선택한 토레카에서 제목·계층 파생 — 공개(active) 카드만 허용.
    const card = await catalogDb.card.findUnique({
      where: { id: BigInt(data.cardId) },
    });
    if (!card || card.status !== "active") {
      throw new DomainError("카드를 찾을 수 없어요 — 다시 선택해주세요");
    }

    const isAuction = data.saleMode === "auction";
    if (isAuction) {
      const ends = new Date(data.auctionEndsAt!);
      if (ends.getTime() <= Date.now() + 60 * 60 * 1000) {
        throw new DomainError("경매 마감은 최소 1시간 뒤여야 합니다");
      }
    }

    const row = await db.$transaction(async (tx) => {
      const listing = await tx.usedListing.create({
        data: {
          sellerAccountId: account.id,
          cardId: card.id,
          teamId: card.teamId,
          memberId: card.memberId,
          seriesId: card.seriesId,
          title: card.name,
          description: data.description,
          condition: data.condition,
          saleMode: data.saleMode,
          price: isAuction ? null : data.price,
          shippingMethod: data.shippingMethod,
          shippingFee: data.shippingFee,
          auctionStartPrice: isAuction ? data.auctionStartPrice : null,
          auctionEndsAt: isAuction ? new Date(data.auctionEndsAt!) : null,
          auctionStatus: isAuction ? "live" : null,
        },
      });
      await tx.usedListingPhoto.createMany({
        data: data.photos.map((p) => ({
          listingId: listing.id,
          r2Key: p.r2Key,
          displayOrder: p.displayOrder,
          isPrimary: p.isPrimary,
        })),
      });
      return listing;
    });

    revalidateUsed();
    return { id: Number(row.id) };
  });
}

// 대표사진 변경 — 판매자 본인만.
export async function setUsedPrimaryPhoto(
  listingId: number,
  photoId: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    await db.$transaction(async (tx) => {
      const listing = await tx.usedListing.findUnique({
        where: { id: BigInt(listingId) },
      });
      if (!listing || listing.sellerAccountId !== account.id) {
        throw new DomainError("내 매물이 아닙니다");
      }
      await tx.usedListingPhoto.updateMany({
        where: { listingId: BigInt(listingId) },
        data: { isPrimary: false },
      });
      const updated = await tx.usedListingPhoto.updateMany({
        where: { id: BigInt(photoId), listingId: BigInt(listingId) },
        data: { isPrimary: true },
      });
      if (updated.count === 0) throw new DomainError("사진을 찾을 수 없습니다");
    });
    revalidateUsed(listingId);
  });
}

// 매물 취소 — 판매자 본인, 거래 시작 전(active)만.
export async function cancelUsedListing(
  listingId: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const result = await db.usedListing.updateMany({
      where: {
        id: BigInt(listingId),
        sellerAccountId: account.id,
        status: "active",
      },
      data: { status: "canceled", updatedAt: new Date() },
    });
    if (result.count === 0) {
      throw new DomainError("취소할 수 없는 매물입니다(거래 진행 중이거나 권한 없음)");
    }
    revalidateUsed(listingId);
  });
}

// 고정가 구매 — 결제는 목업(즉시 paid). 수수료율은 이 시점 설정을 스냅샷.
export async function buyUsedListing(
  input: UsedBuyInput,
): Promise<ActionResult<{ tradeId: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const settings = await getSiteSettings();
    const data = usedBuySchema.parse(input);

    const trade = await db.$transaction(async (tx) => {
      // 판매중 → 거래중 원자 전이 — 동시 구매 경합을 막는다.
      const claimed = await tx.usedListing.updateMany({
        where: {
          id: BigInt(data.listingId),
          status: "active",
          saleMode: "fixed",
        },
        data: { status: "reserved", updatedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new DomainError("이미 거래가 시작됐거나 구매할 수 없는 매물입니다");
      }
      const listing = await tx.usedListing.findUniqueOrThrow({
        where: { id: BigInt(data.listingId) },
      });
      if (listing.sellerAccountId === account.id) {
        throw new DomainError("내 매물은 구매할 수 없습니다");
      }
      const fees = calcUsedTradeFees({
        price: listing.price ?? 0,
        shippingFee: listing.shippingFee,
        feeBp: settings.usedTradeFeeBp,
      });

      // 포인트 사용 — 상품가 한도·잔액 검증 후 트랜잭션 안에서 차감.
      if (data.usePoints > 0) {
        if (data.usePoints > fees.price) {
          throw new DomainError("포인트는 상품 금액까지만 쓸 수 있어요");
        }
        const agg = await tx.pointTransaction.aggregate({
          where: { accountId: account.id },
          _sum: { amount: true },
        });
        if (data.usePoints > (agg._sum.amount ?? 0)) {
          throw new DomainError("보유 포인트가 부족해요");
        }
        await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            amount: -data.usePoints,
            reason: "used_order_use",
            memo: `중고 매물 결제 사용 (listing #${listing.id})`,
          },
        });
      }

      return tx.usedTrade.create({
        data: {
          listingId: listing.id,
          buyerAccountId: account.id,
          sellerAccountId: listing.sellerAccountId,
          price: fees.price,
          shippingFee: fees.shippingFee,
          feeBp: fees.feeBp,
          feeAmount: fees.feeAmount,
          sellerPayout: fees.sellerPayout,
          status: "paid", // 결제 목업 — PG 연동 전까지 즉시 결제 완료로 취급
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          recipientAddress: data.recipientAddress,
        },
      });
    });

    revalidateUsed(data.listingId);
    return { tradeId: Number(trade.id) };
  });
}

// 중고 경매 입찰 — auction 모듈 룰(증분·스나이핑 연장) 재사용.
export async function placeUsedBid(
  listingId: number,
  amount: number,
): Promise<ActionResult<{ currentPrice: number; endsAt: string }>> {
  return runAction(async () => {
    const account = await requireLogin();

    const result = await db.$transaction(async (tx) => {
      const listing = await tx.usedListing.findUnique({
        where: { id: BigInt(listingId) },
      });
      if (!listing || listing.saleMode !== "auction") {
        throw new DomainError("경매 매물이 아닙니다");
      }
      if (listing.sellerAccountId === account.id) {
        throw new DomainError("내 매물에는 입찰할 수 없습니다");
      }
      const now = new Date();
      // 중고 매물은 sale_status 개념이 없어 status(active)를 그대로 매핑한다.
      const evaluation = evaluateBid(
        {
          saleMode: listing.saleMode,
          saleStatus: listing.status === "active" ? "active" : "ended",
          auctionStatus: listing.auctionStatus,
          startPrice: listing.auctionStartPrice,
          currentPrice: listing.auctionCurrentPrice,
          endsAt: listing.auctionEndsAt,
        },
        amount,
        now,
      );
      if (!evaluation.ok) throw new DomainError(evaluation.error);

      await tx.usedBid.create({
        data: { listingId: listing.id, accountId: account.id, amount },
      });
      const newEnds = evaluation.extendedEndsAt ?? listing.auctionEndsAt!;
      await tx.usedListing.update({
        where: { id: listing.id },
        data: {
          auctionCurrentPrice: amount,
          auctionBidCount: { increment: 1 },
          auctionEndsAt: newEnds,
          updatedAt: now,
        },
      });
      return { currentPrice: amount, endsAt: newEnds.toISOString() };
    });

    revalidateUsed(listingId);
    return result;
  });
}

// 마감 정산(lazy) — 상세 조회 시 기한 지난 live를 낙찰/유찰로 전이.
export async function settleUsedListingIfDue(
  listingId: number,
): Promise<boolean> {
  const listing = await db.usedListing.findUnique({
    where: { id: BigInt(listingId) },
  });
  if (
    !listing ||
    listing.saleMode !== "auction" ||
    listing.auctionStatus !== "live" ||
    !listing.auctionEndsAt ||
    listing.auctionEndsAt.getTime() > Date.now()
  ) {
    return false;
  }
  const top = await db.usedBid.findFirst({
    where: { listingId: listing.id },
    orderBy: [{ amount: "desc" }, { id: "asc" }],
  });
  await db.usedListing.update({
    where: { id: listing.id },
    data: top
      ? {
          auctionStatus: "awarded",
          auctionWinnerAccountId: top.accountId,
          auctionPayDueAt: payDueFrom(new Date()),
          price: top.amount, // 낙찰가를 구매가로 — 구매 흐름 재사용
        }
      : { auctionStatus: "passed", status: "canceled" },
  });
  revalidateUsed(listingId);
  return true;
}

// 우체국 QR 발급(목업) — 판매자가 결제 완료 건에 등기번호를 발급.
export async function issueUsedPostQr(
  tradeId: number,
): Promise<ActionResult<{ trackingCode: string }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const trade = await db.usedTrade.findUnique({
      where: { id: BigInt(tradeId) },
    });
    if (!trade || trade.sellerAccountId !== account.id) {
      throw new DomainError("내 판매 건이 아닙니다");
    }
    if (trade.status !== "paid") {
      throw new DomainError("결제 완료 상태에서만 발급할 수 있어요");
    }
    const trackingCode =
      trade.postTrackingCode ?? mockPostTrackingCode(Number(trade.id) * 7919);
    await db.usedTrade.update({
      where: { id: trade.id },
      data: {
        postTrackingCode: trackingCode,
        postQrIssuedAt: trade.postQrIssuedAt ?? new Date(),
        updatedAt: new Date(),
      },
    });
    revalidateUsed(Number(trade.listingId));
    return { trackingCode };
  });
}

// 발송 처리 — 판매자.
export async function markUsedShipped(tradeId: number): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const res = await db.usedTrade.updateMany({
      where: {
        id: BigInt(tradeId),
        sellerAccountId: account.id,
        status: "paid",
      },
      data: { status: "shipped", updatedAt: new Date() },
    });
    if (res.count === 0) throw new DomainError("발송 처리할 수 없는 상태입니다");
    const trade = await db.usedTrade.findUnique({ where: { id: BigInt(tradeId) } });
    if (trade) revalidateUsed(Number(trade.listingId));
  });
}

// 수령 확정 — 구매자. 매물을 판매완료로 마감.
export async function confirmUsedReceived(
  tradeId: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    await db.$transaction(async (tx) => {
      const res = await tx.usedTrade.updateMany({
        where: {
          id: BigInt(tradeId),
          buyerAccountId: account.id,
          status: "shipped",
        },
        data: {
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      if (res.count === 0) {
        throw new DomainError("수령 확정할 수 없는 상태입니다");
      }
      const trade = await tx.usedTrade.findUniqueOrThrow({
        where: { id: BigInt(tradeId) },
      });
      await tx.usedListing.update({
        where: { id: trade.listingId },
        data: { status: "sold", updatedAt: new Date() },
      });
    });
    const trade = await db.usedTrade.findUnique({ where: { id: BigInt(tradeId) } });
    if (trade) revalidateUsed(Number(trade.listingId));
  });
}

// 중고 매물 찜 토글 — 있으면 해제, 없으면 추가. 스토어 wishlist와 동일 UX.
export async function toggleUsedWishlist(
  listingId: number,
): Promise<{ wished: boolean }> {
  const account = await getCurrentAccount();
  if (!account) throw new Error("로그인이 필요합니다.");

  const lid = BigInt(listingId);
  const existing = await db.usedWishlist.findUnique({
    where: {
      accountId_listingId: { accountId: account.id, listingId: lid },
    },
  });

  if (existing) {
    await db.usedWishlist.delete({ where: { id: existing.id } });
    revalidatePath("/wishlist");
    return { wished: false };
  }

  await db.usedWishlist.create({
    data: { accountId: account.id, listingId: lid },
  });
  revalidatePath("/wishlist");
  return { wished: true };
}
