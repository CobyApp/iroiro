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
import { getCheckoutProvider } from "@/lib/payments/checkout";
import { publicOriginFromHeaders, isMobileFromHeaders } from "@/lib/public-origin";
import { isCourierCode } from "@/lib/shipping/couriers";
import { notify } from "@/modules/notifications/lib/notify";
import { calcUsedBundleFees } from "./lib/fees";
import { AUTO_CONFIRM_DAYS } from "./lib/settle-trade";
import { failUsedBundlePayment } from "./lib/bundle-checkout";
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
// 단건 거래와 동일하게 provider.kind 로 흐름이 갈린다:
//  - immediate(mock): 즉시 결제완료(paid)로 묶음·거래 생성.
//  - redirect(카카오페이): 결제대기(pending)로 만들고 결제창 redirectUrl 을 반환.
//    승인은 app/api/payment/kakao/approve?bundle= 가 pending→paid 로 마무리한다.
export async function buyUsedBundle(
  input: UsedBundleBuyInput,
): Promise<ActionResult<{ bundleId: number; redirectUrl?: string }>> {
  return runAction(async () => {
    const account = await requireLogin();
    const settings = await getSiteSettings();
    const data = usedBundleBuySchema.parse(input);
    const ids = data.listingIds.map((n) => BigInt(n));
    const provider = getCheckoutProvider();
    const immediate = provider.kind === "immediate";

    const created = await db.$transaction(async (tx) => {
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
          status: immediate ? "paid" : "pending",
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          recipientAddress: data.recipientAddress,
        },
      });

      // 포인트는 즉시결제만 지금 차감한다. 리다이렉트결제는 대기 중 잡아두지 않고
      // 승인 시점(approveUsedBundlePayment)에 points_used 를 근거로 차감한다.
      if (data.usePoints > 0 && immediate) {
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
            status: immediate ? "paid" : "pending",
            recipientName: data.recipientName,
            recipientPhone: data.recipientPhone,
            recipientAddress: data.recipientAddress,
          };
        }),
      });
      return {
        bundle: created,
        buyerTotal: fees.buyerTotal,
        itemName: listings[0]?.title ?? "중고 묶음",
        itemCount: listings.length,
      };
    });

    const bundleId = Number(created.bundle.id);

    // 즉시결제 — 바로 완료.
    if (immediate) {
      revalidateBundle(bundleId);
      return { bundleId };
    }

    // 리다이렉트결제 — 결제 준비(ready) 후 결제창 URL 반환. HTTP 호출은 트랜잭션 밖.
    const [origin, isMobile] = await Promise.all([
      publicOriginFromHeaders(),
      isMobileFromHeaders(),
    ]);
    const ready = await provider.ready({
      orderNo: `bundle-${bundleId}`,
      userId: account.id,
      itemName:
        created.itemCount > 1
          ? `${created.itemName} 외 ${created.itemCount - 1}건`
          : created.itemName,
      quantity: 1,
      totalAmount: created.buyerTotal - data.usePoints,
      approvalUrl: `${origin}/api/payment/kakao/approve?bundle=${bundleId}`,
      cancelUrl: `${origin}/api/payment/kakao/cancel?bundle=${bundleId}`,
      failUrl: `${origin}/api/payment/kakao/fail?bundle=${bundleId}`,
      isMobile,
    });
    if (!ready.ok) {
      // 준비 실패 — pending 묶음·거래를 취소하고 매물을 다시 판매중으로 되돌린다.
      await failUsedBundlePayment(bundleId, account.id);
      throw new DomainError(ready.failMessage || "결제 준비에 실패했어요");
    }
    await db.usedBundle.update({
      where: { id: created.bundle.id },
      data: { paymentTid: ready.tid, updatedAt: new Date() },
    });
    revalidateBundle(bundleId);
    return { bundleId, redirectUrl: ready.redirectUrl };
  });
}

// 묶음 발송 처리 — 판매자가 실제 택배사·송장번호를 입력한다(수동). 소속 개별 거래도 함께 발송.
export async function markBundleShipped(
  bundleId: number,
  input: { courier: string; trackingCode: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireLogin();
    const courier = input.courier?.trim();
    const trackingCode = input.trackingCode?.trim();
    if (!courier || !isCourierCode(courier)) {
      throw new DomainError("택배사를 선택해주세요");
    }
    if (!trackingCode || trackingCode.length < 6 || trackingCode.length > 40) {
      throw new DomainError("송장번호를 정확히 입력해주세요");
    }
    const now = new Date();
    const res = await db.usedBundle.updateMany({
      where: { id: BigInt(bundleId), sellerAccountId: account.id, status: "paid" },
      data: {
        status: "shipped",
        courier,
        postTrackingCode: trackingCode,
        shippedAt: now,
        updatedAt: now,
      },
    });
    if (res.count === 0) throw new DomainError("발송 처리할 수 없는 상태입니다");
    await db.usedTrade.updateMany({
      where: { bundleId: BigInt(bundleId), status: "paid" },
      data: { status: "shipped", shippedAt: now, updatedAt: now },
    });
    const bundle = await db.usedBundle.findUnique({ where: { id: BigInt(bundleId) } });
    if (bundle) {
      await notify(bundle.buyerAccountId, {
        type: "order_shipped",
        title: "묶음 구매 상품이 발송됐어요",
        body: `발송 후 ${AUTO_CONFIRM_DAYS}일이 지나면 자동으로 구매확정돼요.`,
        link: `/used/bundle/${bundleId}`,
      });
    }
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
