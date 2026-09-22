import "server-only";

import { catalogDb, type CatalogPrisma as Prisma } from "@/lib/catalog-db";
import { toCard } from "./transform";
import type { Card, CardStatus } from "../types";

export type CardListFilter = {
  teamId?: number;
  memberId?: number;
  seriesId?: number;
  status?: CardStatus;
  /** true = 분석 완료만, false = 미분석만. 생략하면 전체. */
  analyzed?: boolean;
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
  if (filter.status) where.status = filter.status;
  if (filter.analyzed !== undefined) {
    where.analyzedAt = filter.analyzed ? { not: null } : null;
  }
  if (filter.q) {
    where.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { itemCode: { contains: filter.q, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    catalogDb.card.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    catalogDb.card.count({ where }),
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
  if (filter.status) where.status = filter.status;
  const rows = await catalogDb.card.findMany({
    where,
    orderBy: { id: "asc" },
    take: 10000,
  });
  return rows.map(toCard);
}

export async function getCardById(id: number): Promise<Card | null> {
  const row = await catalogDb.card.findUnique({ where: { id: BigInt(id) } });
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
  const rows = await catalogDb.card.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toCard);
}

// 연속 등록 힌트 — 같은 (멤버, 시리즈)의 공개 카드 수와 다음 포즈 번호.
// 다음 포즈는 actions.ts 의 nextPose 와 같은 규칙(상태 무관 최대 포즈 + 1) — 대기·반려 카드가 쓴 번호도 건너뛴다.
export type RegistrationHint = { count: number; nextPose: number };

export async function getRegistrationHint(
  memberId: number,
  seriesId: number,
): Promise<RegistrationHint> {
  const where = { memberId: BigInt(memberId), seriesId: BigInt(seriesId) };
  const [count, agg] = await Promise.all([
    catalogDb.card.count({ where: { ...where, status: "active" } }),
    catalogDb.card.aggregate({ where, _max: { pose: true } }),
  ]);
  return { count, nextPose: (agg._max.pose ?? 0) + 1 };
}

// 검수 대기 수 — 관리자 목록 뱃지용.
export async function countPendingCards(): Promise<number> {
  return catalogDb.card.count({ where: { status: "pending" } });
}

// 상태별 카드 수 — 카탈로그 탭(공개 / 검수 대기 / 반려) 카운트.
export async function countCardsByStatus(): Promise<Record<CardStatus, number>> {
  const rows = await catalogDb.card.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<CardStatus, number> = { active: 0, pending: 0, rejected: 0 };
  for (const r of rows) {
    if (r.status in out) out[r.status as CardStatus] = r._count._all;
  }
  return out;
}

// 그룹별 공개 카드 수 — 카탈로그 홈 그룹 타일.
export async function countActiveCardsByTeam(): Promise<Map<number, number>> {
  const rows = await catalogDb.card.groupBy({
    by: ["teamId"],
    where: { status: "active" },
    _count: { _all: true },
  });
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.teamId !== null) out.set(Number(r.teamId), r._count._all);
  }
  return out;
}

// 유사도 후보 — 분석 임베딩이 있는 공개 카드. 같은 그룹(+멤버)으로 좁혀 비교 대상을 줄인다.
// 등록 화면의 "AI 유사 카드 찾기"가 쓰는 후보 집합(core/matcher.py의 catalog 대응).
export type CardEmbeddingCandidate = {
  id: number;
  name: string;
  pose: number;
  frontR2Key: string | null;
  embedding: number[] | null;
};

export async function listAnalyzedCandidates(
  teamId: number | null,
  memberId: number | null,
  limit = 200,
): Promise<CardEmbeddingCandidate[]> {
  const where: Prisma.CardWhereInput = {
    status: "active",
    analyzedAt: { not: null },
  };
  if (teamId !== null) where.teamId = BigInt(teamId);
  if (memberId !== null) where.memberId = BigInt(memberId);
  const rows = await catalogDb.card.findMany({
    where,
    select: {
      id: true,
      name: true,
      pose: true,
      frontR2Key: true,
      analysisEmbedding: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    pose: r.pose,
    frontR2Key: r.frontR2Key,
    embedding: Array.isArray(r.analysisEmbedding)
      ? (r.analysisEmbedding as unknown[]).map(Number)
      : null,
  }));
}

// 카탈로그 홈 AI 요약 — 전체/분석 완료/검수 대기 수와 모델별 분포.
// 임베딩·모델·analyzedAt은 항상 함께 저장되므로 analyzedAt 유무가 "분석됨"의 단일 기준이다.
export type CardAnalysisSummary = {
  total: number;
  analyzed: number;
  pending: number;
  byModel: { model: string; count: number }[];
  latestAnalyzedAt: string | null;
};

export async function getCardAnalysisSummary(): Promise<CardAnalysisSummary> {
  const [total, analyzed, pending, byModelRows, latest] = await Promise.all([
    catalogDb.card.count(),
    catalogDb.card.count({ where: { analyzedAt: { not: null } } }),
    catalogDb.card.count({ where: { status: "pending" } }),
    catalogDb.card.groupBy({
      by: ["analysisModel"],
      where: { analyzedAt: { not: null } },
      _count: { _all: true },
    }),
    catalogDb.card.aggregate({ _max: { analyzedAt: true } }),
  ]);
  return {
    total,
    analyzed,
    pending,
    byModel: byModelRows
      .filter((r) => r.analysisModel !== null)
      .map((r) => ({ model: r.analysisModel as string, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    latestAnalyzedAt: latest._max.analyzedAt
      ? latest._max.analyzedAt.toISOString()
      : null,
  };
}
