import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/lib/notify";
import { getCheckoutProvider } from "@/lib/payments/checkout";
import { DIRECT_AUTO_CONFIRM_MS, DIRECT_AUTO_REFUND_MS } from "./trade-policy";

// 자동 수령확정 타이머 — 발송(shipped) 후 이 기간이 지나면 구매확정이 없어도
// 자동으로 거래를 완료(completed)로 전이한다(에스크로 자금이 판매자에게 묶이지 않도록).
// 경매 settle 과 같은 원칙: 모든 전이는 조건부 updateMany 라 멱등·경합 안전.
export const AUTO_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000; // 발송 후 7일

/** 발송 후 자동확정 안내 문구용 — 일 단위. */
export const AUTO_CONFIRM_DAYS = Math.round(AUTO_CONFIRM_MS / (24 * 60 * 60 * 1000));

function cutoffFrom(now: Date): Date {
  return new Date(now.getTime() - AUTO_CONFIRM_MS);
}

async function notifyCompleted(
  buyerAccountId: string,
  sellerAccountId: string,
  link: string,
): Promise<void> {
  await notify(buyerAccountId, {
    type: "order_delivered",
    title: "안전거래가 자동으로 구매확정됐어요",
    body: `발송 후 ${AUTO_CONFIRM_DAYS}일이 지나 거래가 자동 완료됐어요.`,
    link,
  });
  await notify(sellerAccountId, {
    type: "order_delivered",
    title: "거래가 완료돼 정산이 진행돼요",
    body: `구매확정이 자동 처리돼 정산이 진행됩니다.`,
    link,
  });
}

/**
 * 단건 거래(묶음 아님) 하나를 자동 수령확정한다.
 *  - shipped + shipped_at 이 (now − AUTO_CONFIRM_MS) 이전 → completed(+completedAt, 매물 sold)
 * 전이했으면 true. shipped_at 이 NULL 이면 lte 비교에서 제외돼 자동확정되지 않는다(안전).
 */
export async function autoConfirmUsedTradeIfDue(
  tradeId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = cutoffFrom(now);
  const trade = await db.$transaction(async (tx) => {
    const res = await tx.usedTrade.updateMany({
      where: {
        id: BigInt(tradeId),
        bundleId: null,
        status: "shipped",
        shippedAt: { lte: cutoff },
      },
      data: { status: "completed", completedAt: now, updatedAt: now },
    });
    if (res.count === 0) return null;
    const row = await tx.usedTrade.findUniqueOrThrow({
      where: { id: BigInt(tradeId) },
    });
    await tx.usedListing.update({
      where: { id: row.listingId },
      data: { status: "sold", updatedAt: now },
    });
    return row;
  });
  if (!trade) return false;
  await notifyCompleted(
    trade.buyerAccountId,
    trade.sellerAccountId,
    `/used/${Number(trade.listingId)}`,
  );
  return true;
}

/**
 * 묶음 거래 하나를 자동 수령확정한다 — 묶음 + 소속 매물 전부 마감.
 */
export async function autoConfirmUsedBundleIfDue(
  bundleId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = cutoffFrom(now);
  const bundle = await db.$transaction(async (tx) => {
    const res = await tx.usedBundle.updateMany({
      where: {
        id: BigInt(bundleId),
        status: "shipped",
        shippedAt: { lte: cutoff },
      },
      data: { status: "completed", completedAt: now, updatedAt: now },
    });
    if (res.count === 0) return null;
    const row = await tx.usedBundle.findUniqueOrThrow({
      where: { id: BigInt(bundleId) },
    });
    const trades = await tx.usedTrade.findMany({
      where: { bundleId: row.id },
      select: { listingId: true },
    });
    await tx.usedTrade.updateMany({
      where: { bundleId: row.id, status: "shipped" },
      data: { status: "completed", completedAt: now, updatedAt: now },
    });
    await tx.usedListing.updateMany({
      where: { id: { in: trades.map((t) => t.listingId) } },
      data: { status: "sold", updatedAt: now },
    });
    return row;
  });
  if (!bundle) return false;
  await notifyCompleted(
    bundle.buyerAccountId,
    bundle.sellerAccountId,
    `/used/bundle/${Number(bundle.id)}`,
  );
  return true;
}

// 직거래 전달 후 자동확정 — handed_over + handedOverAt 가 3일 지나면 completed(+매물 sold).
export async function autoConfirmDirectTradeIfDue(
  tradeId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - DIRECT_AUTO_CONFIRM_MS);
  const trade = await db.$transaction(async (tx) => {
    const res = await tx.usedTrade.updateMany({
      where: {
        id: BigInt(tradeId),
        bundleId: null,
        tradeKind: "direct",
        status: "handed_over",
        handedOverAt: { lte: cutoff },
      },
      data: { status: "completed", completedAt: now, updatedAt: now },
    });
    if (res.count === 0) return null;
    const row = await tx.usedTrade.findUniqueOrThrow({ where: { id: BigInt(tradeId) } });
    await tx.usedListing.update({
      where: { id: row.listingId },
      data: { status: "sold", updatedAt: now },
    });
    return row;
  });
  if (!trade) return false;
  await notifyCompleted(
    trade.buyerAccountId,
    trade.sellerAccountId,
    `/used/${Number(trade.listingId)}`,
  );
  return true;
}

// 직거래 미전달 자동환불 — paid(전달표시 없음)로 14일 방치되면 구매자 보호 차원에서 환불.
// PG 환불(HTTP)은 트랜잭션 밖에서 먼저 하고, 성공 시에만 상태를 refunded 로 전이한다.
export async function autoRefundStaleDirectTradeIfDue(
  tradeId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - DIRECT_AUTO_REFUND_MS);
  const trade = await db.usedTrade.findUnique({ where: { id: BigInt(tradeId) } });
  if (
    !trade ||
    trade.tradeKind !== "direct" ||
    trade.status !== "paid" ||
    trade.handedOverAt !== null ||
    trade.createdAt > cutoff
  ) {
    return false;
  }
  const refundAmount = trade.price + trade.shippingFee - trade.pointsUsed;
  if (trade.paymentTid && refundAmount > 0) {
    const refunded = await getCheckoutProvider().refund({
      tid: trade.paymentTid,
      orderNo: `used-${tradeId}`,
      amount: refundAmount,
      reason: "직거래 미전달 자동환불",
    });
    if (!refunded.ok) return false; // 다음 스윕에서 재시도
  }
  const done = await db.$transaction(async (tx) => {
    const res = await tx.usedTrade.updateMany({
      where: { id: BigInt(tradeId), status: "paid", tradeKind: "direct", handedOverAt: null },
      data: {
        status: "refunded",
        refundedAt: now,
        refundAmount,
        refundReason: "직거래 미전달 자동환불",
        updatedAt: now,
      },
    });
    if (res.count === 0) return false;
    if (trade.pointsUsed > 0) {
      await tx.pointTransaction.create({
        data: {
          accountId: trade.buyerAccountId,
          amount: trade.pointsUsed,
          reason: "used_order_refund",
          memo: `직거래 미전달 자동환불 (trade #${tradeId})`,
        },
      });
    }
    await tx.usedListing.updateMany({
      where: { id: trade.listingId, status: "reserved" },
      data: { status: "active", updatedAt: now },
    });
    return true;
  });
  if (!done) return false;
  await notify(trade.buyerAccountId, {
    type: "order_delivered",
    title: "직거래가 자동 환불됐어요",
    body: "판매자 전달이 없어 결제가 자동 환불됐어요.",
    link: `/used/${Number(trade.listingId)}`,
  }).catch(() => {});
  return true;
}

/**
 * 기한 지난 발송 건 일괄 스윕 — cron·마이페이지 진입 시. 처리 건수 반환.
 * 단건(bundleId NULL)과 묶음을 각각 훑는다. 같은 now 로 커트오프를 고정해 멱등.
 * 택배 발송 7일 자동확정 + 직거래 전달 3일 자동확정 + 직거래 미전달 14일 자동환불.
 */
export async function autoConfirmDueUsedTrades(limit = 50): Promise<number> {
  const now = new Date();
  const cutoff = cutoffFrom(now);
  const directConfirmCutoff = new Date(now.getTime() - DIRECT_AUTO_CONFIRM_MS);
  const directRefundCutoff = new Date(now.getTime() - DIRECT_AUTO_REFUND_MS);
  const [trades, bundles, directDue, directStale] = await Promise.all([
    db.usedTrade.findMany({
      where: { bundleId: null, status: "shipped", shippedAt: { lte: cutoff } },
      select: { id: true },
      take: limit,
    }),
    db.usedBundle.findMany({
      where: { status: "shipped", shippedAt: { lte: cutoff } },
      select: { id: true },
      take: limit,
    }),
    db.usedTrade.findMany({
      where: { bundleId: null, tradeKind: "direct", status: "handed_over", handedOverAt: { lte: directConfirmCutoff } },
      select: { id: true },
      take: limit,
    }),
    db.usedTrade.findMany({
      where: { bundleId: null, tradeKind: "direct", status: "paid", handedOverAt: null, createdAt: { lte: directRefundCutoff } },
      select: { id: true },
      take: limit,
    }),
  ]);
  let confirmed = 0;
  for (const { id } of trades) {
    if (await autoConfirmUsedTradeIfDue(Number(id), now)) confirmed += 1;
  }
  for (const { id } of bundles) {
    if (await autoConfirmUsedBundleIfDue(Number(id), now)) confirmed += 1;
  }
  for (const { id } of directDue) {
    if (await autoConfirmDirectTradeIfDue(Number(id), now)) confirmed += 1;
  }
  for (const { id } of directStale) {
    if (await autoRefundStaleDirectTradeIfDue(Number(id), now)) confirmed += 1;
  }
  return confirmed;
}
