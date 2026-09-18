"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getSiteSettings } from "@/modules/site-settings/lib/queries";
import { calcUsedBundleFees, mockPostTrackingCode } from "./lib/fees";
import { usedBundleBuySchema, type UsedBundleBuyInput } from "./lib/schema";

async function requireLogin() {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
  return account;
}
function revalidateBundle(id?: number) {
  revalidatePath("/used");
  if (id) revalidatePath(`/used/bundle/${id}`);
}

// 묶음 구매 — 같은 판매자의 고정가 매물 2개 이상을 한 번에, 배송비 1회.
export async function buyUsedBundle(
  input: UsedBundleBuyInput,
): Promise<ActionResult<{ bundleId: number }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const settings = await getSiteSettings();
    const data = usedBundleBuySchema.parse(input);
    const ids = data.listingIds.map((n) => BigInt(n));

    const bundle = await db.$transaction(async (tx) => {
      // 대상 매물을 먼저 확인 — 같은 판매자·고정가·판매중·내 것 아님.
      const listings = await tx.usedListing.findMany({
        where: { id: { in: ids } },
      });
      if (listings.length !== ids.length) {
        throw new DomainError("이미 판매된 매물이 포함돼 있어요");
      }
      const sellerId = listings[0].sellerAccountId;
      if (listings.some((l) => l.sellerAccountId !== sellerId)) {
        throw new DomainError("같은 판매자의 매물만 묶을 수 있어요");
      }
      if (sellerId === account.id) {
        throw new DomainError("내 매물은 구매할 수 없습니다");
      }
      if (listings.some((l) => l.saleMode !== "fixed" || l.status !== "active")) {
        throw new DomainError("바로 판매 중인 매물만 묶음 구매할 수 있어요");
      }

      // 원자 전이 — 판매중 → 거래중. count가 다르면 경합으로 롤백.
      const claimed = await tx.usedListing.updateMany({
        where: { id: { in: ids }, status: "active", saleMode: "fixed" },
        data: { status: "reserved", updatedAt: new Date() },
      });
      if (claimed.count !== ids.length) {
        throw new DomainError("이미 거래가 시작된 매물이 있어요");
      }

      const fees = calcUsedBundleFees({
        items: listings.map((l) => ({
          price: l.price ?? 0,
          shippingFee: l.shippingFee,
        })),
        feeBp: settings.usedTradeFeeBp,
      });

      // 포인트 사용 — 상품가 합계 한도·잔액 검증 후 차감.
      if (data.usePoints > 0) {
        if (data.usePoints > fees.itemTotal) {
          throw new DomainError("포인트는 상품 금액까지만 쓸 수 있어요");
        }
        const agg = await tx.pointTransaction.aggregate({
          where: { accountId: account.id },
          _sum: { amount: true },
        });
        if (data.usePoints > (agg._sum.amount ?? 0)) {
          throw new DomainError("보유 포인트가 부족해요");
        }
      }

      const created = await tx.usedBundle.create({
        data: {
          buyerAccountId: account.id,
          sellerAccountId: sellerId,
          itemTotal: fees.itemTotal,
          shippingFee: fees.shippingFee,
          pointsUsed: data.usePoints,
          feeAmount: fees.feeAmount,
          // 판매자 정산은 포인트(구매자 할인)와 무관 — 상품가+배송비−수수료 그대로.
          sellerPayout: fees.sellerPayout,
          status: "paid",
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          recipientAddress: data.recipientAddress,
        },
      });

      if (data.usePoints > 0) {
        await tx.pointTransaction.create({
          data: {
            accountId: account.id,
            amount: -data.usePoints,
            reason: "used_order_use",
            memo: `중고 묶음 결제 사용 (bundle #${created.id})`,
          },
        });
      }

      // 개별 거래 — 배송비는 묶음이 보유하므로 각 trade.shipping_fee=0.
      await tx.usedTrade.createMany({
        data: listings.map((l) => {
          const price = l.price ?? 0;
          const feeAmount = Math.round((price * settings.usedTradeFeeBp) / 10000);
          return {
            listingId: l.id,
            bundleId: created.id,
            buyerAccountId: account.id,
            sellerAccountId: sellerId,
            price,
            shippingFee: 0,
            feeBp: settings.usedTradeFeeBp,
            feeAmount,
            sellerPayout: price - feeAmount,
            status: "paid",
            recipientName: data.recipientName,
            recipientPhone: data.recipientPhone,
            recipientAddress: data.recipientAddress,
          };
        }),
      });
      return created;
    });

    revalidateBundle(Number(bundle.id));
    return { bundleId: Number(bundle.id) };
  });
}

// 묶음 QR 발급 — 판매자.
export async function issueBundlePostQr(
  bundleId: number,
): Promise<ActionResult<{ trackingCode: string }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const bundle = await db.usedBundle.findUnique({ where: { id: BigInt(bundleId) } });
    if (!bundle || bundle.sellerAccountId !== account.id) {
      throw new DomainError("내 판매 건이 아닙니다");
    }
    if (bundle.status !== "paid") {
      throw new DomainError("결제 완료 상태에서만 발급할 수 있어요");
    }
    const trackingCode =
      bundle.postTrackingCode ?? mockPostTrackingCode(Number(bundle.id) * 6271);
    await db.usedBundle.update({
      where: { id: bundle.id },
      data: {
        postTrackingCode: trackingCode,
        postQrIssuedAt: bundle.postQrIssuedAt ?? new Date(),
        updatedAt: new Date(),
      },
    });
    revalidateBundle(bundleId);
    return { trackingCode };
  });
}

export async function markBundleShipped(bundleId: number): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const res = await db.usedBundle.updateMany({
      where: { id: BigInt(bundleId), sellerAccountId: account.id, status: "paid" },
      data: { status: "shipped", updatedAt: new Date() },
    });
    if (res.count === 0) throw new DomainError("발송 처리할 수 없는 상태입니다");
    await db.usedTrade.updateMany({
      where: { bundleId: BigInt(bundleId), status: "paid" },
      data: { status: "shipped", updatedAt: new Date() },
    });
    revalidateBundle(bundleId);
  });
}

// 수령 확정 — 구매자. 묶음의 모든 매물을 판매완료로 마감.
export async function confirmBundleReceived(bundleId: number): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    await db.$transaction(async (tx) => {
      const res = await tx.usedBundle.updateMany({
        where: { id: BigInt(bundleId), buyerAccountId: account.id, status: "shipped" },
        data: { status: "completed", completedAt: new Date(), updatedAt: new Date() },
      });
      if (res.count === 0) throw new DomainError("수령 확정할 수 없는 상태입니다");
      const trades = await tx.usedTrade.findMany({
        where: { bundleId: BigInt(bundleId) },
        select: { listingId: true },
      });
      const now = new Date();
      await tx.usedTrade.updateMany({
        where: { bundleId: BigInt(bundleId), status: "shipped" },
        data: { status: "completed", completedAt: now, updatedAt: now },
      });
      await tx.usedListing.updateMany({
        where: { id: { in: trades.map((t) => t.listingId) } },
        data: { status: "sold", updatedAt: now },
      });
    });
    revalidateBundle(bundleId);
  });
}
