"use server";

import { revalidatePath } from "next/cache";
import { DomainError, parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { requireUsedManager } from "@/modules/admin/lib/requireAdminSpace";
import {
  usedReviewDismissSchema,
  usedReviewHideSchema,
  usedReviewIdSchema,
  usedReviewReportCreateSchema,
} from "./lib/schema";
import * as reportLib from "./lib/review-report";

// 고객이 중고 거래 후기를 신고한다. 로그인 필수(서버 백스톱).
export async function reportUsedReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const data = parseActionInput(usedReviewReportCreateSchema, input);
    await reportLib.createUsedReviewReport(account.id, data);
    revalidatePath("/market/review-reports");
  });
}

// ── 중고거래 관리 공간(/market)의 후기 신고 처리 — 모두 used 부분 권한(또는 site admin)만.

/** 후기 숨김 — hidden_* 스탬프 + 미해결 신고 일괄 처리. 판매자 상점에서 사라지므로 함께 revalidate. */
export async function hideUsedReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const data = parseActionInput(usedReviewHideSchema, input);
    await reportLib.hideUsedReview(admin.id, data);
    revalidatePath("/market/review-reports");
    revalidatePath("/used");
  });
}

/** 숨김 해제 — 후기를 다시 노출. */
export async function unhideUsedReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const { reviewId } = parseActionInput(usedReviewIdSchema, input);
    await reportLib.unhideUsedReview(admin.id, reviewId);
    revalidatePath("/market/review-reports");
    revalidatePath("/used");
  });
}

/** 신고 기각 — 대상 후기는 그대로. */
export async function dismissUsedReviewReport(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireUsedManager();
    const data = parseActionInput(usedReviewDismissSchema, input);
    await reportLib.dismissUsedReviewReport(admin.id, data);
    revalidatePath("/market/review-reports");
  });
}
