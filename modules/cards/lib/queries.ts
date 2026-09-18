import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { toCard } from "./transform";
import type { Card, CardSource, CardStatus } from "../types";

export type CardListFilter = {
  teamId?: number;
  memberId?: number;
  seriesId?: number;
  source?: CardSource;
  status?: CardStatus;
  q?: string;
  page?: number;
  pageSize?: number;
};

// 토레카 목록 (관리자) — 필터 + 페이지네이션.
export async function listCards(
  filter: CardListFilter = {},
): Promise<{ items: Card[]; total: number }> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 40;
  const where: Prisma.CardWhereInput = {};
  if (filter.teamId !== undefined) where.teamId = BigInt(filter.teamId);
  if (filter.memberId !== undefined) where.memberId = BigInt(filter.memberId);
  if (filter.seriesId !== undefined) where.seriesId = BigInt(filter.seriesId);
  if (filter.source) where.source = filter.source;
  if (filter.status) where.status = filter.status;
  if (filter.q) {
    where.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { itemCode: { contains: filter.q, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.card.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.card.count({ where }),
  ]);
  return { items: rows.map(toCard), total };
}

// CSV 내보내기용 — 필터 그대로, 페이지 없이 전체.
export async function listCardsForExport(
  filter: Omit<CardListFilter, "page" | "pageSize"> = {},
): Promise<Card[]> {
  const where: Prisma.CardWhereInput = {};
  if (filter.teamId !== undefined) where.teamId = BigInt(filter.teamId);
  if (filter.memberId !== undefined) where.memberId = BigInt(filter.memberId);
  if (filter.seriesId !== undefined) where.seriesId = BigInt(filter.seriesId);
  if (filter.source) where.source = filter.source;
  if (filter.status) where.status = filter.status;
  const rows = await db.card.findMany({
    where,
    orderBy: { id: "asc" },
    take: 10000,
  });
  return rows.map(toCard);
}

export async function getCardById(id: number): Promise<Card | null> {
  const row = await db.card.findUnique({ where: { id: BigInt(id) } });
  return row ? toCard(row) : null;
}

// 중복 확인용 — 같은 시리즈(+멤버)의 공개 카드. 유저 등록 화면에서
// "이미 있는 카드"를 먼저 보여줘 중복 제보를 줄인다.
export async function listExistingCards(
  seriesId: number | null,
  memberId: number | null,
  limit = 24,
): Promise<Card[]> {
  if (seriesId === null && memberId === null) return [];
  const where: Prisma.CardWhereInput = { status: "active" };
  if (seriesId !== null) where.seriesId = BigInt(seriesId);
  if (memberId !== null) where.memberId = BigInt(memberId);
  const rows = await db.card.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toCard);
}

// 검수 대기 수 — 관리자 목록 뱃지용.
export async function countPendingCards(): Promise<number> {
  return db.card.count({ where: { status: "pending" } });
}
