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
import { notify } from "@/modules/notifications/lib/notify";
import { canonicalPair } from "@/modules/messages/types";
import { buildR2Key, getPublicUrl } from "@/lib/r2/presign";
import { compressImageBuffer } from "@/lib/image/compress-image";
import { relayUploadToR2 } from "@/lib/r2/relay";
import {
  usedBuyOfferCreateSchema,
  usedBuyOfferIdSchema,
  usedBuyRequestCreateSchema,
  usedBuyRequestIdSchema,
  type UsedBuyOfferCreateInput,
  type UsedBuyRequestCreateInput,
} from "./lib/buy-schema";

async function requireLogin() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
  return account;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const BUY_PHOTO_MAX_DIM = 1280;
const BUY_PHOTO_QUALITY = 78;

// 삽니다 참고 이미지 업로드 — 서버 경유 압축(워터마크 없음: 요청자 소유물이 아닌 참고용).
// buy-request/original/ 접두로 저장하고 공개 URL을 미리보기로 돌려준다.
export async function uploadBuyRequestPhotoFile(
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
        maxDim: BUY_PHOTO_MAX_DIM,
        quality: BUY_PHOTO_QUALITY,
        watermark: false,
      });
    } catch {
      throw new DomainError(`이미지를 처리할 수 없습니다: ${filename}`);
    }
    const r2Key = buildR2Key(`${filename.replace(/\.[^.]+$/, "")}.jpg`).replace(
      "products/original/",
      "buy-request/original/",
    );
    await relayUploadToR2(new Blob([new Uint8Array(compressed)], { type: "image/jpeg" }), r2Key);
    return { r2Key, previewUrl: getPublicUrl(r2Key) };
  });
}

function revalidateBuy(requestId?: number) {
  revalidatePath("/used/wanted");
  if (requestId) revalidatePath(`/used/wanted/${requestId}`);
  revalidatePath("/mypage");
}

// 삽니다 등록 — 토레카(그룹·멤버·시리즈)는 선택. 제목은 필수.
export async function createBuyRequest(
  input: UsedBuyRequestCreateInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const data = usedBuyRequestCreateSchema.parse(input);

    // 그룹·멤버·시리즈를 골랐다면 실제로 존재하는지 확인(오염 방지).
    if (data.teamId != null) {
      const team = await catalogDb.team.findUnique({ where: { id: BigInt(data.teamId) } });
      if (!team) throw new DomainError("그룹을 찾을 수 없어요");
    }
    if (data.memberId != null) {
      const member = await catalogDb.member.findUnique({ where: { id: BigInt(data.memberId) } });
      if (!member) throw new DomainError("멤버를 찾을 수 없어요");
    }
    if (data.seriesId != null) {
      const series = await catalogDb.series.findUnique({ where: { id: BigInt(data.seriesId) } });
      if (!series) throw new DomainError("시리즈를 찾을 수 없어요");
    }

    const row = await db.$transaction(async (tx) => {
      const created = await tx.usedBuyRequest.create({
        data: {
          requesterAccountId: account.id,
          itemType: data.itemType,
          teamId: data.teamId != null ? BigInt(data.teamId) : null,
          memberId: data.memberId != null ? BigInt(data.memberId) : null,
          seriesId: data.seriesId != null ? BigInt(data.seriesId) : null,
          title: data.title,
          description: data.description,
          minCondition: data.minCondition ?? null,
          budget: data.budget ?? null,
          quantity: data.quantity,
        },
      });
      if (data.photos.length > 0) {
        await tx.usedBuyRequestPhoto.createMany({
          data: data.photos.map((p) => ({
            requestId: created.id,
            r2Key: p.r2Key,
            displayOrder: p.displayOrder,
          })),
        });
      }
      return created;
    });
    revalidateBuy();
    return { id: Number(row.id) };
  });
}

// 요청 종료 — 요청자 본인, 모집중/성사 상태만. closed 로 전이(목록에서 숨김).
export async function closeBuyRequest(
  input: { requestId: number },
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const { requestId } = usedBuyRequestIdSchema.parse(input);
    const res = await db.usedBuyRequest.updateMany({
      where: {
        id: BigInt(requestId),
        requesterAccountId: account.id,
        status: { in: ["open", "fulfilled"] },
      },
      data: { status: "closed", updatedAt: new Date() },
    });
    if (res.count === 0) throw new DomainError("종료할 수 없는 요청입니다");
    revalidateBuy(requestId);
  });
}

// 오퍼(팔게요) 등록 — 판매자. 내 요청엔 불가, 모집중인 요청에만, 요청당 활성 1건.
export async function createBuyOffer(
  input: UsedBuyOfferCreateInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const data = usedBuyOfferCreateSchema.parse(input);

    // 연결 매물은 내 판매중 매물만 허용.
    if (data.listingId != null) {
      const listing = await db.usedListing.findUnique({
        where: { id: BigInt(data.listingId) },
        select: { sellerAccountId: true, status: true },
      });
      if (!listing || listing.sellerAccountId !== account.id) {
        throw new DomainError("연결할 수 있는 내 매물이 아니에요");
      }
    }

    const created = await db.$transaction(async (tx) => {
      const request = await tx.usedBuyRequest.findUnique({
        where: { id: BigInt(data.requestId) },
        select: { id: true, status: true, requesterAccountId: true, title: true },
      });
      if (!request || request.status !== "open") {
        throw new DomainError("오퍼를 보낼 수 없는 요청입니다");
      }
      if (request.requesterAccountId === account.id) {
        throw new DomainError("내 요청에는 오퍼를 보낼 수 없어요");
      }
      // 활성 오퍼 중복 방지(철회 후 재등록은 허용).
      const existing = await tx.usedBuyOffer.findFirst({
        where: {
          requestId: request.id,
          sellerAccountId: account.id,
          status: { not: "withdrawn" },
        },
        select: { id: true },
      });
      if (existing) throw new DomainError("이미 이 요청에 오퍼를 보냈어요");

      const offer = await tx.usedBuyOffer.create({
        data: {
          requestId: request.id,
          sellerAccountId: account.id,
          listingId: data.listingId != null ? BigInt(data.listingId) : null,
          price: data.price,
          message: data.message,
        },
      });
      await tx.usedBuyRequest.update({
        where: { id: request.id },
        data: { offerCount: { increment: 1 }, updatedAt: new Date() },
      });
      return { offer, request };
    });

    await notify(created.request.requesterAccountId, {
      type: "message",
      title: "삽니다 요청에 새 오퍼가 왔어요",
      body: `“${created.request.title}” — ${data.price.toLocaleString()}원 제안`,
      link: `/used/wanted/${data.requestId}`,
    }).catch(() => {});
    revalidateBuy(data.requestId);
    return { id: Number(created.offer.id) };
  });
}

// 오퍼 철회 — 판매자 본인, 대기중만.
export async function withdrawBuyOffer(
  input: { offerId: number },
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const { offerId } = usedBuyOfferIdSchema.parse(input);
    const requestId = await db.$transaction(async (tx) => {
      const offer = await tx.usedBuyOffer.findUnique({
        where: { id: BigInt(offerId) },
        select: { id: true, sellerAccountId: true, status: true, requestId: true },
      });
      if (!offer || offer.sellerAccountId !== account.id) {
        throw new DomainError("철회할 수 없는 오퍼입니다");
      }
      const res = await tx.usedBuyOffer.updateMany({
        where: { id: BigInt(offerId), sellerAccountId: account.id, status: "pending" },
        data: { status: "withdrawn", updatedAt: new Date() },
      });
      if (res.count === 0) throw new DomainError("철회할 수 없는 오퍼입니다");
      await tx.usedBuyRequest.updateMany({
        where: { id: offer.requestId, offerCount: { gt: 0 } },
        data: { offerCount: { decrement: 1 }, updatedAt: new Date() },
      });
      return Number(offer.requestId);
    });
    revalidateBuy(requestId);
  });
}

// 오퍼 거절 — 요청자 본인, 대기중만.
export async function declineBuyOffer(
  input: { offerId: number },
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const { offerId } = usedBuyOfferIdSchema.parse(input);
    const result = await db.$transaction(async (tx) => {
      const offer = await tx.usedBuyOffer.findUnique({
        where: { id: BigInt(offerId) },
        select: { id: true, sellerAccountId: true, status: true, requestId: true },
      });
      if (!offer) throw new DomainError("오퍼를 찾을 수 없어요");
      const request = await tx.usedBuyRequest.findUnique({
        where: { id: offer.requestId },
        select: { requesterAccountId: true, title: true },
      });
      if (!request || request.requesterAccountId !== account.id) {
        throw new DomainError("권한이 없어요");
      }
      const res = await tx.usedBuyOffer.updateMany({
        where: { id: BigInt(offerId), status: "pending" },
        data: { status: "declined", updatedAt: new Date() },
      });
      if (res.count === 0) throw new DomainError("거절할 수 없는 오퍼입니다");
      return { sellerAccountId: offer.sellerAccountId, requestId: Number(offer.requestId), title: request.title };
    });
    await notify(result.sellerAccountId, {
      type: "message",
      title: "보낸 오퍼가 거절됐어요",
      body: `“${result.title}” 요청`,
      link: `/used/wanted/${result.requestId}`,
    }).catch(() => {});
    revalidateBuy(result.requestId);
  });
}

// 오퍼 수락 — 요청자 본인. 해당 오퍼 accepted, 나머지 대기 오퍼는 declined,
// 요청은 fulfilled 로 전이. 두 사람 사이 쪽지 스레드를 열어 자동 안내 메시지를 남긴다.
export async function acceptBuyOffer(
  input: { offerId: number },
): Promise<ActionResult<{ threadId: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const { offerId } = usedBuyOfferIdSchema.parse(input);

    const result = await db.$transaction(async (tx) => {
      const offer = await tx.usedBuyOffer.findUnique({
        where: { id: BigInt(offerId) },
        select: { id: true, sellerAccountId: true, status: true, requestId: true, price: true },
      });
      if (!offer) throw new DomainError("오퍼를 찾을 수 없어요");
      const request = await tx.usedBuyRequest.findUnique({
        where: { id: offer.requestId },
        select: { id: true, requesterAccountId: true, status: true, title: true },
      });
      if (!request || request.requesterAccountId !== account.id) {
        throw new DomainError("권한이 없어요");
      }
      if (request.status !== "open") {
        throw new DomainError("이미 성사됐거나 종료된 요청이에요");
      }
      const claimed = await tx.usedBuyOffer.updateMany({
        where: { id: offer.id, status: "pending" },
        data: { status: "accepted", updatedAt: new Date() },
      });
      if (claimed.count === 0) throw new DomainError("수락할 수 없는 오퍼입니다");
      // 나머지 대기 오퍼는 자동 거절.
      await tx.usedBuyOffer.updateMany({
        where: { requestId: request.id, status: "pending", id: { not: offer.id } },
        data: { status: "declined", updatedAt: new Date() },
      });
      await tx.usedBuyRequest.update({
        where: { id: request.id },
        data: { status: "fulfilled", updatedAt: new Date() },
      });

      // 쪽지 스레드 개설 + 자동 안내 메시지(요청자 → 판매자).
      const { a, b } = canonicalPair(account.id, offer.sellerAccountId);
      const now = new Date();
      const meIsA = a === account.id;
      const thread = await tx.messageThread.upsert({
        where: { aAccountId_bAccountId: { aAccountId: a, bAccountId: b } },
        create: {
          aAccountId: a,
          bAccountId: b,
          lastMessageAt: now,
          aLastReadAt: meIsA ? now : null,
          bLastReadAt: meIsA ? null : now,
        },
        update: {
          lastMessageAt: now,
          ...(meIsA ? { aLastReadAt: now } : { bLastReadAt: now }),
        },
      });
      await tx.message.create({
        data: {
          threadId: thread.id,
          senderAccountId: account.id,
          body: `[삽니다] “${request.title}” 오퍼(${offer.price.toLocaleString()}원)를 수락했어요. 거래를 진행해요!`,
        },
      });
      return {
        threadId: Number(thread.id),
        sellerAccountId: offer.sellerAccountId,
        requestId: Number(request.id),
        title: request.title,
      };
    });

    await notify(result.sellerAccountId, {
      type: "message",
      title: "오퍼가 수락됐어요!",
      body: `“${result.title}” 요청 — 쪽지로 거래를 진행해요.`,
      link: `/messages/${result.threadId}`,
    }).catch(() => {});
    revalidateBuy(result.requestId);
    revalidatePath("/messages");
    revalidatePath(`/messages/${result.threadId}`);
    return { threadId: result.threadId };
  });
}
