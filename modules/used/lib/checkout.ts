import "server-only";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCheckoutProvider } from "@/lib/payments/checkout";

// 리다이렉트 결제(카카오페이 등)의 승인/실패 처리 — app/api/payment/kakao/* 라우트가 호출.
// 결제 대기(pending) 거래를 승인 시 결제완료(paid)로, 실패·취소 시 취소(canceled)로 전이한다.
// 모든 전이는 status='pending' 가드의 조건부 updateMany 라 중복 콜백에도 안전(멱등).

export type ApproveResult = {
  ok: boolean;
  listingId?: number;
  message?: string;
};

/** pending 거래 결제 승인 — approve() 성공 시 paid 로 전이하고 포인트를 차감한다. */
export async function approveUsedTradePayment(
  tradeId: number,
  pgToken: string,
  buyerAccountId: string,
): Promise<ApproveResult> {
  const trade = await db.usedTrade.findUnique({ where: { id: BigInt(tradeId) } });
  if (!trade) return { ok: false, message: "거래를 찾을 수 없어요" };
  // 소유권 검증 — 콜백 세션 계정이 이 거래의 구매자여야 한다(남의 거래 승인·조작 차단).
  if (trade.buyerAccountId !== buyerAccountId) {
    return { ok: false, message: "권한이 없어요" };
  }
  const listingId = Number(trade.listingId);
  if (trade.status === "paid") return { ok: true, listingId }; // 멱등 — 이미 승인됨
  if (trade.status !== "pending") {
    return { ok: false, listingId, message: "결제할 수 없는 거래 상태예요" };
  }
  if (!trade.paymentTid) {
    return { ok: false, listingId, message: "결제 정보가 없어요" };
  }

  const provider = getCheckoutProvider();
  const approval = await provider.approve({
    tid: trade.paymentTid,
    orderNo: `used-${tradeId}`,
    userId: trade.buyerAccountId,
    pgToken,
  });
  if (!approval.ok) {
    return { ok: false, listingId, message: approval.failMessage };
  }

  await db.$transaction(async (tx) => {
    const res = await tx.usedTrade.updateMany({
      where: { id: BigInt(tradeId), status: "pending" },
      data: { status: "paid", updatedAt: new Date() },
    });
    if (res.count === 0) return; // 중복 콜백/경합 — 이미 처리됨
    // 포인트는 승인 시점에 차감(대기 중에는 잡아두지 않는다).
    if (trade.pointsUsed > 0) {
      await tx.pointTransaction.create({
        data: {
          accountId: trade.buyerAccountId,
          amount: -trade.pointsUsed,
          reason: "used_order_use",
          memo: `중고 매물 결제 사용 (listing #${listingId})`,
        },
      });
    }
  });

  revalidatePath(`/used/${listingId}`);
  revalidatePath("/mypage");
  return { ok: true, listingId };
}

/** pending 거래 실패/취소 — canceled 로 전이하고 예약된 매물을 다시 판매중으로 되돌린다. */
export async function failUsedTradePayment(
  tradeId: number,
  buyerAccountId: string,
): Promise<{ listingId?: number }> {
  const trade = await db.usedTrade.findUnique({ where: { id: BigInt(tradeId) } });
  if (!trade) return {};
  const listingId = Number(trade.listingId);
  // 소유권 검증 — 제3자가 tradeId 만으로 남의 결제대기 거래를 취소(그리핑)하지 못하게.
  if (trade.buyerAccountId !== buyerAccountId) return { listingId };
  if (trade.status !== "pending") return { listingId };

  await db.$transaction(async (tx) => {
    const res = await tx.usedTrade.updateMany({
      where: { id: BigInt(tradeId), status: "pending" },
      data: { status: "canceled", updatedAt: new Date() },
    });
    if (res.count === 0) return;
    // 결제 대기 중에는 포인트를 아직 차감하지 않았으므로 환급 불필요.
    await tx.usedListing.updateMany({
      where: { id: trade.listingId, status: "reserved" },
      data: { status: "active", updatedAt: new Date() },
    });
  });

  revalidatePath(`/used/${listingId}`);
  return { listingId };
}
