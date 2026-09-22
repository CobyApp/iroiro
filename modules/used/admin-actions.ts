"use server";

import { revalidatePath } from "next/cache";
import { parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { requireUsedManager } from "@/modules/admin/lib/requireAdminSpace";
import { usedBlockSchema, usedDismissReportSchema, usedListingIdSchema } from "./lib/schema";
import * as reportLib from "./lib/report";

// 중고거래 관리 공간(/market)의 처리 액션 — 모두 used 부분 권한(또는 site admin)만.
// 도메인 로직은 lib/report.ts(순수·테스트 대상), 여기선 가드·검증·revalidate 만 담당(룰 2·3).

function revalidateMarket(): void {
  revalidatePath("/market");
  revalidatePath("/market/reports");
  revalidatePath("/market/listings");
  revalidatePath("/market/blocked");
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
