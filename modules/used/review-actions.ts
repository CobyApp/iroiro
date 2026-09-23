"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DomainError, parseActionInput, runAction, type ActionResult } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { usedReviewCreateSchema } from "./lib/schema";

// 중고 거래 후기 작성 — 거래·작성자당 1개, 완료 거래의 당사자(구매자/판매자)만.
// 상대방(reviewee)에 대한 별점·코멘트를 남긴다(양방향 상호 후기).
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
    // 당사자(구매자 또는 판매자)만 — 상대방이 후기 대상이 된다.
    const isBuyer = trade.buyerAccountId === account.id;
    const isSeller = trade.sellerAccountId === account.id;
    if (!isBuyer && !isSeller) {
      throw new DomainError("내 거래만 후기를 남길 수 있어요");
    }
    if (trade.status !== "completed") {
      throw new DomainError("거래가 완료된 뒤에 후기를 남길 수 있어요");
    }
    const revieweeAccountId = isBuyer
      ? trade.sellerAccountId
      : trade.buyerAccountId;

    try {
      await db.usedReview.create({
        data: {
          tradeId: BigInt(data.tradeId),
          listingId: trade.listingId,
          reviewerAccountId: account.id,
          // seller_account_id 는 거래의 판매자(고정) — 하위 호환 유지.
          sellerAccountId: trade.sellerAccountId,
          revieweeAccountId,
          rating: data.rating,
          comment: data.comment ?? null,
        },
      });
    } catch (error) {
      // (trade_id, reviewer_account_id) 유니크 — 같은 거래에 내가 이미 남김.
      if (
        isUniqueViolationOn(error, "trade_id") ||
        isUniqueViolationOn(error, "reviewer_account_id")
      ) {
        throw new DomainError("이미 후기를 남긴 거래예요");
      }
      throw error;
    }

    revalidatePath("/mypage/used");
    revalidatePath(`/used/seller/${revieweeAccountId}`);
  });
}
