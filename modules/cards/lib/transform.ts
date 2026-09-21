import type { Card as PrismaCard } from "@prisma/client";
import type { Card, CardStatus } from "../types";

export function toCard(row: PrismaCard): Card {
  return {
    id: Number(row.id),
    itemCode: row.itemCode,
    itemType: row.itemType,
    teamId: row.teamId === null ? null : Number(row.teamId),
    memberId: row.memberId === null ? null : Number(row.memberId),
    seriesId: row.seriesId === null ? null : Number(row.seriesId),
    name: row.name,
    description: row.description,
    frontR2Key: row.frontR2Key,
    retailPriceJpy: row.retailPriceJpy,
    pose: row.pose,
    status: row.status as CardStatus,
    submittedByAccountId: row.submittedByAccountId,
    reviewNote: row.reviewNote,
    analysisModel: row.analysisModel,
    analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
