"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DomainError, parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { usedReviewCreateSchema } from "./lib/schema";

// 중고 거래 후기 작성 — 거래당 1개, 구매자 본인·완료 거래만. 판매자에 대한 별점·코멘트.
export async function createUsedReview(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const data = parseActionInput(usedReviewCreateSchema, input);

    const trade = await db.usedTrade.findUnique({
      where: { id: BigInt(data.tradeId) },
      select: {
        buyerAccountId: true,
        sellerAccountId: true,
        listingId: true,
        status: true,
      },
    });
    if (!trade) throw new DomainError("거래를 찾을 수 없어요");
    if (trade.buyerAccountId !== account.id) {
      throw new DomainError("내 거래만 후기를 남길 수 있어요");
    }
    if (trade.status !== "completed") {
      throw new DomainError("거래가 완료된 뒤에 후기를 남길 수 있어요");
    }

    try {
      await db.usedReview.create({
        data: {
          tradeId: BigInt(data.tradeId),
          listingId: trade.listingId,
          reviewerAccountId: account.id,
          sellerAccountId: trade.sellerAccountId,
          rating: data.rating,
          comment: data.comment ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolationOn(error, "trade_id")) {
        throw new DomainError("이미 후기를 남긴 거래예요");
      }
      throw error;
    }

    revalidatePath("/mypage/used");
    revalidatePath(`/used/seller/${trade.sellerAccountId}`);
  });
}
