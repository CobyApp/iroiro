import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type BidRow = {
  /** 마스킹된 입찰자 표시명 (예: "이**") */
  bidder: string;
  amount: number;
  createdAt: string;
  isMine: boolean;
};

function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return `${trimmed || "익명"}**`;
  return `${trimmed[0]}${"*".repeat(Math.min(trimmed.length - 1, 4))}`;
}

function agoLabelOf(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export type TradeRow = { price: number; agoLabel: string };

/**
 * 같은 카드의 최근 거래가 — 결제 완료된 주문의 판매 단가.
 * 같은 카드 판별: item_code가 있으면 동일 코드, 없으면 동일 상품명.
 */
export async function listRecentTradePrices(
  product: {
    id: number;
    catalogCardId: number | null;
    itemCode: string | null;
    name: string;
  },
  limit = 5,
): Promise<TradeRow[]> {
  // 같은 "카드"(=포즈)의 거래만 — 상품은 카탈로그 카드와 1:1이라 catalog_card_id 가 포즈 단위 키다.
  // 카드 연결이 없으면 item_code, 그것도 없으면 이름으로 폴백(둘 다 포즈까지 구분되진 않음).
  const where: Prisma.ProductWhereInput =
    product.catalogCardId !== null
      ? { catalogCardId: BigInt(product.catalogCardId) }
      : product.itemCode
        ? { itemCode: product.itemCode }
        : { name: product.name };
  const sameCard = await db.product.findMany({
    where,
    select: { id: true },
  });
  if (sameCard.length === 0) return [];

  const rows = await db.orderItem.findMany({
    where: {
      productId: { in: sameCard.map((r) => r.id) },
      order: { status: { in: ["paid", "shipped", "delivered"] } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { unitPrice: true, createdAt: true },
  });
  return rows.map((r) => ({
    price: r.unitPrice,
    agoLabel: agoLabelOf(r.createdAt),
  }));
}

/** 상품의 최근 입찰 내역(금액 내림차순) — 입찰자명 마스킹. */
export async function listRecentBids(
  productId: number,
  viewerAccountId: string | null,
  limit = 8,
): Promise<BidRow[]> {
  const bids = await db.auctionBid.findMany({
    where: { productId: BigInt(productId) },
    orderBy: [{ amount: "desc" }, { id: "asc" }],
    take: limit,
    select: { accountId: true, amount: true, createdAt: true },
  });
  if (bids.length === 0) return [];

  const accountIds = Array.from(new Set(bids.map((b) => b.accountId)));
  const accounts = await db.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(accounts.map((a) => [a.id, a.displayName]));

  return bids.map((bid) => ({
    bidder: maskName(nameById.get(bid.accountId) ?? "익명"),
    amount: bid.amount,
    createdAt: bid.createdAt.toISOString(),
    isMine: viewerAccountId !== null && bid.accountId === viewerAccountId,
  }));
}
