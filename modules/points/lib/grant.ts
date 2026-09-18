import "server-only";

import { db } from "@/lib/db";
import {
  REVIEW_POINTS,
  WELCOME_FREE_SHIPPING_COUPONS,
  WELCOME_POINTS,
} from "./rules";

/**
 * 가입 웰컴 혜택 — 포인트 + 무료배송 쿠폰.
 * point_tx_welcome_once(부분 유니크)가 중복 지급 백스톱 — 재시도 시 조용히 건너뛴다.
 */
export async function grantWelcomeBenefits(accountId: string): Promise<void> {
  try {
    await db.pointTransaction.create({
      data: {
        accountId,
        amount: WELCOME_POINTS,
        reason: "welcome",
        memo: "가입 축하 포인트",
      },
    });
  } catch {
    // 이미 지급됨(유니크 충돌) — 쿠폰도 함께 지급됐다고 보고 종료.
    return;
  }
  await db.accountCoupon.createMany({
    data: Array.from({ length: WELCOME_FREE_SHIPPING_COUPONS }, () => ({
      accountId,
      kind: "free_shipping",
      issuedReason: "welcome",
    })),
  });
}

/**
 * 리뷰 첫 작성 적립 — 주문×상품당 1회.
 * point_tx_review_once(부분 유니크)가 백스톱: 동시 요청·삭제 후 재작성 모두
 * 유니크 충돌로 조용히 건너뛴다. 적립됐으면 true.
 */
export async function grantReviewPoints(
  accountId: string,
  orderId: number,
  productId: number,
): Promise<boolean> {
  try {
    await db.pointTransaction.create({
      data: {
        accountId,
        amount: REVIEW_POINTS,
        reason: "review",
        orderId: BigInt(orderId),
        productId: BigInt(productId),
        memo: "도착 인증 리뷰 적립",
      },
    });
    return true;
  } catch {
    return false;
  }
}
