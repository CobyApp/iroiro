"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { db } from "@/lib/db";
import { getCurrentAccount } from "@/modules/auth/dal";
import { notify } from "@/modules/notifications/lib/notify";
import { evaluateBid } from "./lib/rules";
import { settleProductIfDue } from "./lib/settle";

const placeBidSchema = z.object({
  productId: z.number().int().positive(),
  amount: z.number().int().positive(),
});

export type PlaceBidInput = z.infer<typeof placeBidSchema>;

async function requireAccountId(): Promise<string> {
  const account = await getCurrentAccount();
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account.id;
}

export type PlaceBidResult = {
  currentPrice: number;
  bidCount: number;
  endsAt: string;
};

type LockedAuctionRow = {
  sale_mode: string;
  sale_status: string;
  auction_status: string | null;
  auction_start_price: number | null;
  auction_current_price: number | null;
  auction_ends_at: Date | null;
  auction_bid_count: number;
};

/**
 * 입찰 — 로그인 필수, 취소 불가.
 *
 * 동시성: 상품 행을 `SELECT … FOR UPDATE`로 잠가 같은 상품의 입찰을 완전히
 * 직렬화한다. 잠금 이후의 "최신 값"으로 마감·최소 인상폭까지 판정하므로,
 * 경합 중 낮은 입찰이 끼어들거나 인상폭 미만 입찰이 통과할 수 없다.
 * 상대가 먼저 올렸다면 새 현재가·최소가를 담은 메시지로 거절된다.
 * 스나이핑 방지 연장(마감 5분 전 → +5분)도 잠금 후의 마감 시각 기준.
 * 추월 알림 대상(직전 최고 입찰자)도 잠금 안에서 확정해 정확하다.
 */
export async function placeBid(
  input: PlaceBidInput,
): Promise<ActionResult<PlaceBidResult>> {
  return runAction(async () => {
    const data = parseActionInput(placeBidSchema, input);
    const accountId = await requireAccountId();
    const productId = BigInt(data.productId);

    // 마감시각이 지난 경매는 먼저 정산(lazy) — 잠금 밖이라 이후 경합은
    // 트랜잭션 안의 최신값 판정이 다시 막는다.
    await settleProductIfDue(productId);

    const outcome = await db.$transaction(async (tx) => {
      const now = new Date();
      // 행 잠금 — 같은 상품의 동시 입찰·마감 정산이 이 지점에서 직렬화된다.
      const rows = await tx.$queryRaw<LockedAuctionRow[]>`
        SELECT sale_mode, sale_status, auction_status,
               auction_start_price, auction_current_price,
               auction_ends_at, auction_bid_count
        FROM product WHERE id = ${productId}
        FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new DomainError("상품을 찾을 수 없습니다");

      const verdict = evaluateBid(
        {
          saleMode: row.sale_mode,
          saleStatus: row.sale_status,
          auctionStatus: row.auction_status,
          startPrice: row.auction_start_price,
          currentPrice: row.auction_current_price,
          endsAt: row.auction_ends_at,
        },
        data.amount,
        now,
      );
      if (!verdict.ok) throw new DomainError(verdict.error);

      // 추월 알림 대상 — 잠금 안에서 확정(경합 시에도 정확한 직전 최고 입찰자).
      const prevTop = await tx.auctionBid.findFirst({
        where: { productId },
        orderBy: [{ amount: "desc" }, { id: "asc" }],
        select: { accountId: true },
      });

      const nextEndsAt = verdict.extendedEndsAt ?? row.auction_ends_at!;
      await tx.product.update({
        where: { id: productId },
        data: {
          auctionCurrentPrice: data.amount,
          auctionBidCount: { increment: 1 },
          auctionEndsAt: nextEndsAt,
          updatedAt: now,
        },
      });
      await tx.auctionBid.create({
        data: { productId, accountId, amount: data.amount },
      });

      return {
        prevTopAccountId: prevTop?.accountId ?? null,
        currentPrice: data.amount,
        bidCount: row.auction_bid_count + 1,
        endsAt: nextEndsAt.toISOString(),
      };
    });

    // 입찰한 매물은 자동 찜 — 추월·마감을 찜 목록에서도 추적할 수 있게.
    // 실패해도 입찰엔 영향 없음(이미 찜한 경우 유니크 upsert가 no-op).
    await db.wishlist
      .upsert({
        where: {
          accountId_productId: {
            accountId,
            productId: BigInt(data.productId),
          },
        },
        create: { accountId, productId: BigInt(data.productId) },
        update: {},
      })
      .catch(() => {});

    // 알림은 잠금 밖(커밋 후) — 락 보유 시간을 최소로.
    if (
      outcome.prevTopAccountId !== null &&
      outcome.prevTopAccountId !== accountId
    ) {
      await notify(outcome.prevTopAccountId, {
        type: "bid_outbid",
        title: "입찰이 추월됐어요",
        body: `누군가 ₩${data.amount.toLocaleString()}로 더 높게 입찰했어요. 다시 도전해 보세요!`,
        link: `/products/${data.productId}`,
      });
    }

    revalidatePath(`/products/${data.productId}`);
    revalidatePath("/products");

    return {
      currentPrice: outcome.currentPrice,
      bidCount: outcome.bidCount,
      endsAt: outcome.endsAt,
    };
  });
}
