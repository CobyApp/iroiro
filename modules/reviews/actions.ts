"use server";

import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { db } from "@/lib/db";
import { getCurrentAccount } from "@/modules/auth/dal";
import { grantReviewPoints } from "@/modules/points/lib/grant";
import { REVIEW_POINTS } from "@/modules/points/lib/rules";
import { requireDeliveryManager } from "@/modules/admin/lib/requireAdminSpace";
import type { OrderStatus } from "@/modules/orders/types";
import { canReviewOrderStatus } from "./lib/rules";
import {
  reviewDeleteSchema,
  reviewDismissReportSchema,
  reviewHideSchema,
  reviewIdSchema,
  reviewUpsertSchema,
  type ReviewDeleteInput,
  type ReviewUpsertInput,
} from "./lib/schema";
import * as reportLib from "./lib/report";

async function requireAccountId(): Promise<string> {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account.id;
}

/**
 * 리뷰 작성·수정(upsert) — 구매 검증이 핵심 경계:
 * 본인 주문 + 리뷰 가능 상태(발송 이후) + 그 주문에 실제 포함된 상품만.
 */
export async function upsertReview(
  input: ReviewUpsertInput,
): Promise<ActionResult<{ pointsGranted: number }>> {
  return runAction(async () => {
    const data = parseActionInput(reviewUpsertSchema, input);
    const accountId = await requireAccountId();

    const order = await db.order.findUnique({
      where: { id: BigInt(data.orderId) },
      select: { accountId: true, status: true },
    });
    if (!order || order.accountId !== accountId) {
      throw new DomainError("주문을 찾을 수 없습니다");
    }
    if (!canReviewOrderStatus(order.status as OrderStatus)) {
      throw new DomainError("발송된 주문만 리뷰를 남길 수 있습니다");
    }

    const item = await db.orderItem.findFirst({
      where: {
        orderId: BigInt(data.orderId),
        productId: BigInt(data.productId),
      },
      select: { id: true },
    });
    if (!item) {
      throw new DomainError("이 주문에 포함된 상품이 아닙니다");
    }

    await db.productReview.upsert({
      where: {
        orderId_productId_accountId: {
          orderId: BigInt(data.orderId),
          productId: BigInt(data.productId),
          accountId,
        },
      },
      create: {
        orderId: BigInt(data.orderId),
        productId: BigInt(data.productId),
        accountId,
        rating: data.rating,
        body: data.body,
      },
      update: { rating: data.rating, body: data.body, updatedAt: new Date() },
    });

    // 첫 작성 적립 — 주문×상품당 1회(부분 유니크 백스톱이라 수정·재작성·경합에도
    // 이중 적립 없음). 적립 실패는 리뷰 저장에 영향 주지 않는다.
    const granted = await grantReviewPoints(
      accountId,
      data.orderId,
      data.productId,
    ).catch(() => false);

    revalidatePath(`/products/${data.productId}`);
    revalidatePath("/orders");
    return { pointsGranted: granted ? REVIEW_POINTS : 0 };
  });
}

/** 관리자 리뷰 삭제 — 부적절 리뷰 정리용(소유권 무관). */
export async function adminDeleteReview(
  input: ReviewDeleteInput,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireDeliveryManager();
    const data = parseActionInput(reviewDeleteSchema, input);
    const result = await db.productReview.deleteMany({
      where: { id: BigInt(data.reviewId) },
    });
    if (result.count === 0) {
      throw new DomainError("리뷰를 찾을 수 없습니다");
    }
    revalidatePath("/delivery/reviews");
  });
}

// ── 리뷰 신고 처리(스토어 관리 공간 /delivery) — 모두 delivery 부분 권한(또는 site admin)만.
// 도메인 로직은 lib/report.ts(순수·테스트 대상), 여기선 가드·검증·revalidate 만 담당(룰 2·3).

/** 리뷰 숨김 — hidden_* 스탬프 + 미해결 신고 일괄 처리. 고객 화면에서 사라지므로 함께 revalidate. */
export async function hideProductReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireDeliveryManager();
    const data = parseActionInput(reviewHideSchema, input);
    await reportLib.hideProductReview(admin.id, data);
    revalidatePath("/delivery/reviews");
  });
}

/** 숨김 해제 — 리뷰를 다시 노출. */
export async function unhideProductReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireDeliveryManager();
    const { reviewId } = parseActionInput(reviewIdSchema, input);
    await reportLib.unhideProductReview(admin.id, reviewId);
    revalidatePath("/delivery/reviews");
  });
}

/** 신고 기각 — 대상 리뷰는 그대로. */
export async function dismissProductReviewReport(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireDeliveryManager();
    const data = parseActionInput(reviewDismissReportSchema, input);
    await reportLib.dismissProductReviewReport(admin.id, data);
    revalidatePath("/delivery/reviews");
  });
}

/** 리뷰 삭제 — 본인 것만. */
export async function deleteReview(
  input: ReviewDeleteInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(reviewDeleteSchema, input);
    const accountId = await requireAccountId();

    // deleteMany의 accountId 조건이 소유권 경계 — 남의 리뷰는 0행으로 끝난다.
    const result = await db.productReview.deleteMany({
      where: { id: BigInt(data.reviewId), accountId },
    });
    if (result.count === 0) {
      throw new DomainError("리뷰를 찾을 수 없습니다");
    }
    revalidatePath("/orders");
  });
}
