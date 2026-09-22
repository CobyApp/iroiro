"use server";

import { revalidatePath } from "next/cache";
import { DomainError, parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { reviewReportCreateSchema } from "./lib/schema";
import { createProductReviewReport } from "./lib/report";

// 고객이 스토어 상품 리뷰를 신고한다. 로그인 필수(버튼도 로그인 사용자에게만 노출 — 서버 백스톱).
// 신고는 리뷰의 공개 노출을 바꾸지 않으므로 관리 큐(/admin/store/reviews)만 revalidate.
export async function reportProductReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const data = parseActionInput(reviewReportCreateSchema, input);
    await createProductReviewReport(account.id, data);
    revalidatePath("/admin/store/reviews");
  });
}
