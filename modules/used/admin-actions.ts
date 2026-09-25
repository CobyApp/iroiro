"use server";

import { revalidatePath } from "next/cache";
import { DomainError, parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { requireUsedManager } from "@/modules/admin/lib/requireAdminSpace";
import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/lib/notify";
import { getCheckoutProvider } from "@/lib/payments/checkout";
import { usedBlockSchema, usedDismissReportSchema, usedListingIdSchema } from "./lib/schema";
import * as reportLib from "./lib/report";

// 중고거래 관리 공간(/admin/used)의 처리 액션 — 모두 used 부분 권한(또는 site admin)만.
// 도메인 로직은 lib/report.ts(순수·테스트 대상), 여기선 가드·검증·revalidate 만 담당(룰 2·3).

function revalidateMarket(): void {
  revalidatePath("/admin/used");
  revalidatePath("/admin/used/reports");
  revalidatePath("/admin/used/listings");
  revalidatePath("/admin/used/blocked");
}

// 매물 차단 — status=blocked 스탬프 + 미해결 신고 일괄 처리. 고객 목록·상세에서도 사라지므로 함께 revalidate.
export async function blockUsedListing(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const data = parseActionInput(usedBlockSchema, input);
    await reportLib.blockUsedListing(admin.id, data);
    revalidateMarket();
    revalidatePath("/used");
    revalidatePath(`/used/${data.listingId}`);
  });
}

// 차단 해제 — 매물을 다시 판매중으로 복원.
export async function unblockUsedListing(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const { listingId } = parseActionInput(usedListingIdSchema, input);
    await reportLib.unblockUsedListing(admin.id, listingId);
    revalidateMarket();
    revalidatePath("/used");
    revalidatePath(`/used/${listingId}`);
  });
}

// 신고 기각 — 대상 매물은 그대로.
export async function dismissUsedReport(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const data = parseActionInput(usedDismissReportSchema, input);
    await reportLib.dismissUsedReport(admin.id, data);
    revalidateMarket();
  });
}

function revalidateDispute(listingId: number): void {
  revalidatePath("/admin/used/disputes");
  revalidatePath("/admin/used");
  revalidatePath(`/used/${listingId}`);
}

// 분쟁 중재 — 구매자 환불로 종결. disputed → refunded(PG 환불 + 포인트 복원 + 매물 재판매).
export async function resolveUsedDisputeRefund(
  tradeId: number,
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const trade = await db.usedTrade.findUnique({ where: { id: BigInt(tradeId) } });
    if (!trade || trade.status !== "disputed") {
      throw new DomainError("중재할 수 없는 상태입니다");
    }
    const refundAmount = trade.price + trade.shippingFee - trade.pointsUsed;
    if (trade.paymentTid && refundAmount > 0) {
      const refunded = await getCheckoutProvider().refund({
        tid: trade.paymentTid,
        orderNo: `used-${tradeId}`,
        amount: refundAmount,
        reason: note?.trim() || "관리자 분쟁 중재 환불",
      });
      if (!refunded.ok) throw new DomainError(refunded.failMessage || "결제 취소에 실패했어요");
    }
    const now = new Date();
    await db.$transaction(async (tx) => {
      const res = await tx.usedTrade.updateMany({
        where: { id: BigInt(tradeId), status: "disputed" },
        data: {
          status: "refunded",
          refundedAt: now,
          refundAmount,
          refundReason: note?.trim() || "관리자 분쟁 중재 환불",
          resolvedBy: admin.id,
          updatedAt: now,
        },
      });
      if (res.count === 0) throw new DomainError("중재할 수 없는 상태입니다");
      if (trade.pointsUsed > 0) {
        await tx.pointTransaction.create({
          data: {
            accountId: trade.buyerAccountId,
            amount: trade.pointsUsed,
            reason: "used_order_refund",
            memo: `분쟁 중재 환불 (trade #${tradeId})`,
          },
        });
      }
      await tx.usedListing.updateMany({
        where: { id: trade.listingId, status: "reserved" },
        data: { status: "active", updatedAt: now },
      });
    });
    await notify(trade.buyerAccountId, {
      type: "order_delivered",
      title: "분쟁이 환불로 처리됐어요",
      body: "운영팀 확인 후 결제가 환불됐어요.",
      link: `/used/${Number(trade.listingId)}`,
    }).catch(() => {});
    await notify(trade.sellerAccountId, {
      type: "order_delivered",
      title: "거래 분쟁이 환불로 종결됐어요",
      body: "운영팀 중재로 구매자에게 환불 처리됐어요.",
      link: `/used/${Number(trade.listingId)}`,
    }).catch(() => {});
    revalidateDispute(Number(trade.listingId));
  });
}

// 분쟁 중재 — 판매자 정산으로 종결. disputed → completed(+매물 sold). 판매자에게 정산.
export async function resolveUsedDisputeRelease(
  tradeId: number,
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const now = new Date();
    const trade = await db.$transaction(async (tx) => {
      const res = await tx.usedTrade.updateMany({
        where: { id: BigInt(tradeId), status: "disputed" },
        data: {
          status: "completed",
          completedAt: now,
          refundReason: note?.trim() ? `release: ${note.trim()}` : null,
          resolvedBy: admin.id,
          updatedAt: now,
        },
      });
      if (res.count === 0) throw new DomainError("중재할 수 없는 상태입니다");
      const row = await tx.usedTrade.findUniqueOrThrow({ where: { id: BigInt(tradeId) } });
      await tx.usedListing.update({
        where: { id: row.listingId },
        data: { status: "sold", updatedAt: now },
      });
      return row;
    });
    await notify(trade.sellerAccountId, {
      type: "order_delivered",
      title: "거래 분쟁이 정산으로 종결됐어요",
      body: "운영팀 확인 후 거래가 완료돼 정산이 진행돼요.",
      link: `/used/${Number(trade.listingId)}`,
    }).catch(() => {});
    await notify(trade.buyerAccountId, {
      type: "order_delivered",
      title: "거래 분쟁이 종결됐어요",
      body: "운영팀 확인 후 거래가 완료 처리됐어요.",
      link: `/used/${Number(trade.listingId)}`,
    }).catch(() => {});
    revalidateDispute(Number(trade.listingId));
  });
}
