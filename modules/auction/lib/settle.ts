import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/lib/notify";
import { payDueFrom } from "./rules";

// 경매 정산 — lazy(조회/입찰 시) + cron 스윕에서 공용.
// 모든 상태 전이는 조건부 UPDATE(updateMany + where 상태 가드)라 멱등·경합 안전.

/**
 * 기한이 지난 경매 하나를 정산한다.
 *  - live + 마감 경과: 최고 입찰 있으면 낙찰(awarded, salePrice=낙찰가), 없으면 유찰(passed)
 *  - awarded + 결제기한 경과(미결제): 유찰(passed) — 이미 결제돼 재고 0이면 판매완료로 보존
 * 상태가 바뀌었으면 true.
 */
export async function settleProductIfDue(productId: bigint): Promise<boolean> {
  const now = new Date();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      saleMode: true,
      auctionStatus: true,
      auctionEndsAt: true,
      auctionPayDueAt: true,
      auctionWinnerAccountId: true,
      regularPrice: true,
      stockQuantity: true,
    },
  });
  if (!product || product.saleMode !== "auction") return false;

  if (
    product.auctionStatus === "live" &&
    product.auctionEndsAt !== null &&
    product.auctionEndsAt.getTime() <= now.getTime()
  ) {
    const top = await db.auctionBid.findFirst({
      where: { productId },
      orderBy: [{ amount: "desc" }, { id: "asc" }],
      select: { accountId: true, amount: true },
    });
    if (top) {
      const updated = await db.product.updateMany({
        where: {
          id: productId,
          auctionStatus: "live",
          auctionEndsAt: { lte: now },
        },
        data: {
          auctionStatus: "awarded",
          auctionWinnerAccountId: top.accountId,
          auctionCurrentPrice: top.amount,
          auctionPayDueAt: payDueFrom(now),
          // 낙찰가로 판매가 갱신 → 기존 장바구니·주문 흐름을 그대로 재사용.
          salePrice: top.amount,
          regularPrice: Math.max(product.regularPrice, top.amount),
          updatedAt: now,
        },
      });
      if (updated.count > 0) {
        await notify(top.accountId, {
          type: "auction_won",
          title: "축하해요, 낙찰됐어요! 🎉",
          body: `낙찰가 ₩${top.amount.toLocaleString()} — 48시간 내에 결제해 주세요.`,
          link: `/products/${Number(productId)}`,
        });
      }
      return updated.count > 0;
    }
    const updated = await db.product.updateMany({
      where: {
        id: productId,
        auctionStatus: "live",
        auctionEndsAt: { lte: now },
      },
      data: { auctionStatus: "passed", updatedAt: now },
    });
    return updated.count > 0;
  }

  if (
    product.auctionStatus === "awarded" &&
    product.auctionPayDueAt !== null &&
    product.auctionPayDueAt.getTime() <= now.getTime() &&
    // 재고 0 = 낙찰자가 이미 결제 완료(차감됨) — 판매 완료로 보존.
    product.stockQuantity > 0
  ) {
    const updated = await db.product.updateMany({
      where: {
        id: productId,
        auctionStatus: "awarded",
        auctionPayDueAt: { lte: now },
        stockQuantity: { gt: 0 },
      },
      data: {
        auctionStatus: "passed",
        auctionWinnerAccountId: null,
        auctionPayDueAt: null,
        updatedAt: now,
      },
    });
    if (updated.count > 0 && product.auctionWinnerAccountId) {
      await notify(product.auctionWinnerAccountId, {
        type: "auction_expired",
        title: "결제 기한이 지나 낙찰이 취소됐어요",
        body: "48시간 내 결제가 확인되지 않아 낙찰이 취소되었습니다.",
        link: `/products/${Number(productId)}`,
      });
    }
    return updated.count > 0;
  }

  return false;
}

/** 기한 지난 경매 일괄 스윕 (cron·관리자 목록 진입 시) — 처리 건수 반환. */
export async function settleDueAuctions(limit = 50): Promise<number> {
  const now = new Date();
  const due = await db.product.findMany({
    where: {
      saleMode: "auction",
      OR: [
        { auctionStatus: "live", auctionEndsAt: { lte: now } },
        {
          auctionStatus: "awarded",
          auctionPayDueAt: { lte: now },
          stockQuantity: { gt: 0 },
        },
      ],
    },
    select: { id: true },
    take: limit,
  });
  let settled = 0;
  for (const { id } of due) {
    if (await settleProductIfDue(id)) settled += 1;
  }
  return settled;
}
