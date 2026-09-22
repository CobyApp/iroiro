import "server-only";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCheckoutProvider } from "@/lib/payments/checkout";

// 묶음(bundle) 리다이렉트 결제의 승인/실패 처리 — app/api/payment/kakao/* 라우트가 호출.
// 단건 거래(checkout.ts)와 같은 규칙: pending 묶음을 승인 시 paid, 실패·취소 시 canceled 로
// 전이하고, 소속 개별 거래(used_trade)도 함께 전이한다. 모든 전이는 status='pending' 가드의
// 조건부 updateMany 라 중복 콜백에도 안전(멱등)하다.

export type ApproveBundleResult = {
  ok: boolean;
  bundleId?: number;
  message?: string;
};

/** pending 묶음 결제 승인 — approve() 성공 시 묶음·소속 거래를 paid 로 전이하고 포인트를 차감한다. */
export async function approveUsedBundlePayment(
  bundleId: number,
  pgToken: string,
  buyerAccountId: string,
): Promise<ApproveBundleResult> {
  const bundle = await db.usedBundle.findUnique({
    where: { id: BigInt(bundleId) },
  });
  if (!bundle) return { ok: false, message: "묶음을 찾을 수 없어요" };
  // 소유권 검증 — 콜백 세션 계정이 이 묶음의 구매자여야 한다(남의 묶음 승인·조작 차단).
  if (bundle.buyerAccountId !== buyerAccountId) {
    return { ok: false, message: "권한이 없어요" };
  }
  if (bundle.status === "paid") return { ok: true, bundleId }; // 멱등 — 이미 승인됨
  if (bundle.status !== "pending") {
    return { ok: false, bundleId, message: "결제할 수 없는 묶음 상태예요" };
  }
  if (!bundle.paymentTid) {
    return { ok: false, bundleId, message: "결제 정보가 없어요" };
  }

  const provider = getCheckoutProvider();
  const approval = await provider.approve({
    tid: bundle.paymentTid,
    orderNo: `bundle-${bundleId}`,
    userId: bundle.buyerAccountId,
    pgToken,
  });
  if (!approval.ok) {
    return { ok: false, bundleId, message: approval.failMessage };
  }

  await db.$transaction(async (tx) => {
    const res = await tx.usedBundle.updateMany({
      where: { id: BigInt(bundleId), status: "pending" },
      data: { status: "paid", updatedAt: new Date() },
    });
    if (res.count === 0) return; // 중복 콜백/경합 — 이미 처리됨
    // 소속 개별 거래도 함께 paid 로.
    await tx.usedTrade.updateMany({
      where: { bundleId: BigInt(bundleId), status: "pending" },
      data: { status: "paid", updatedAt: new Date() },
    });
    // 포인트는 승인 시점에 차감(대기 중에는 잡아두지 않는다).
    if (bundle.pointsUsed > 0) {
      await tx.pointTransaction.create({
        data: {
          accountId: bundle.buyerAccountId,
          amount: -bundle.pointsUsed,
          reason: "used_order_use",
          memo: `중고 묶음 결제 사용 (bundle #${bundleId})`,
        },
      });
    }
  });

  revalidatePath(`/used/bundle/${bundleId}`);
  revalidatePath("/mypage");
  return { ok: true, bundleId };
}

/** pending 묶음 실패/취소 — canceled 로 전이하고 예약된 매물을 다시 판매중으로 되돌린다. */
export async function failUsedBundlePayment(
  bundleId: number,
  buyerAccountId: string,
): Promise<{ bundleId?: number }> {
  const bundle = await db.usedBundle.findUnique({
    where: { id: BigInt(bundleId) },
  });
  if (!bundle) return {};
  // 소유권 검증 — 제3자가 bundleId 만으로 남의 결제대기 묶음을 취소(그리핑)하지 못하게.
  if (bundle.buyerAccountId !== buyerAccountId) return { bundleId };
  if (bundle.status !== "pending") return { bundleId };

  await db.$transaction(async (tx) => {
    const res = await tx.usedBundle.updateMany({
      where: { id: BigInt(bundleId), status: "pending" },
      data: { status: "canceled", updatedAt: new Date() },
    });
    if (res.count === 0) return;
    // 소속 거래의 매물 id 를 모아 다시 판매중으로 되돌린다.
    const trades = await tx.usedTrade.findMany({
      where: { bundleId: BigInt(bundleId) },
      select: { listingId: true },
    });
    await tx.usedTrade.updateMany({
      where: { bundleId: BigInt(bundleId), status: "pending" },
      data: { status: "canceled", updatedAt: new Date() },
    });
    // 결제 대기 중에는 포인트를 아직 차감하지 않았으므로 환급 불필요.
    const listingIds = trades.map((t) => t.listingId);
    if (listingIds.length > 0) {
      await tx.usedListing.updateMany({
        where: { id: { in: listingIds }, status: "reserved" },
        data: { status: "active", updatedAt: new Date() },
      });
    }
  });

  revalidatePath(`/used/bundle/${bundleId}`);
  return { bundleId };
}
