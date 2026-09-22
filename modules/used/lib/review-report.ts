import "server-only";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { assertWithinRateLimit } from "@/modules/posts/lib/rate-limit";
import type {
  UsedReviewReportQueueItem,
  UsedReviewReportReason,
  UsedReviewReportSnapshot,
  UsedReviewReportTargetStatus,
} from "../types";

// 중고 거래 후기 신고의 순수 DB 로직 — used_report 와 같은 계약(대상 잠금 + 노출 재검증 + 스냅샷 동결).
// 처리(숨김/기각)는 미해결 신고만 원자적으로 resolve 한다.

type Db = typeof defaultDb;

export const USED_REVIEW_REPORT_PAGE_SIZE = 20;

const USED_REVIEW_REPORT_RATE = [
  { seconds: 600, max: 5 },
  { seconds: 86_400, max: 20 },
] as const;

const reportCounter = (db: Db, reporterAccountId: string) => (since: Date) =>
  db.usedReviewReport.count({ where: { reporterAccountId, createdAt: { gte: since } } });

export type UsedReviewReportQueuePage = {
  items: UsedReviewReportQueueItem[];
  total: number;
  page: number;
  pageSize: number;
};

const mask = (accountId: string) => `#${accountId.slice(-4)}`;

// 고객 신고 접수 — 대상 후기 FOR UPDATE 잠금 하에 노출(미숨김) 재검증 + 스냅샷 동결.
export async function createUsedReviewReport(
  reporterAccountId: string,
  input: { reviewId: number; reason: string; detail?: string },
  db: Db = defaultDb,
): Promise<void> {
  const reviewId = BigInt(input.reviewId);
  await assertWithinRateLimit(USED_REVIEW_REPORT_RATE, reportCounter(db, reporterAccountId));
  try {
    await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          reviewer_account_id: string;
          rating: number;
          comment: string | null;
          listing_id: bigint;
          seller_name: string;
          reviewer_name: string;
          created_at: Date;
        }[]
      >`
        SELECT r.reviewer_account_id, r.rating, r.comment, r.listing_id,
               COALESCE(s.display_name, '(탈퇴 회원)') AS seller_name,
               COALESCE(a.display_name, '(탈퇴 회원)') AS reviewer_name,
               r.created_at
        FROM used_review r
        LEFT JOIN account s ON s.id = r.seller_account_id
        LEFT JOIN account a ON a.id = r.reviewer_account_id
        WHERE r.id = ${reviewId} AND r.hidden_at IS NULL
        FOR UPDATE OF r`;
      const review = rows[0];
      if (!review) throw new DomainError("신고할 수 없는 후기입니다");
      if (review.reviewer_account_id === reporterAccountId) {
        throw new DomainError("본인 후기는 신고할 수 없습니다");
      }
      await tx.usedReviewReport.create({
        data: {
          reviewId,
          reporterAccountId,
          reason: input.reason,
          detail: input.detail ?? null,
          snapshot: {
            version: 1,
            rating: review.rating,
            comment: review.comment,
            listingId: Number(review.listing_id),
            sellerName: review.seller_name,
            reviewerName: review.reviewer_name,
            createdAt: review.created_at.toISOString(),
          } satisfies UsedReviewReportSnapshot,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "review_id")) {
      throw new DomainError("이미 신고한 후기입니다");
    }
    throw error;
  }
}

function targetStatusOf(
  found: { hiddenAt: Date | null } | undefined,
): UsedReviewReportTargetStatus {
  if (!found) return "missing";
  return found.hiddenAt ? "hidden" : "visible";
}

export async function listUsedReviewReportQueue(
  page = 1,
  pageSize = USED_REVIEW_REPORT_PAGE_SIZE,
  db: Db = defaultDb,
): Promise<UsedReviewReportQueuePage> {
  const [total, reports] = await Promise.all([
    db.usedReviewReport.count({ where: { resolvedAt: null } }),
    db.usedReviewReport.findMany({
      where: { resolvedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const reviewIds = [...new Set(reports.map((r) => r.reviewId))];
  const reviews = reviewIds.length
    ? await db.usedReview.findMany({
        where: { id: { in: reviewIds } },
        select: { id: true, hiddenAt: true },
      })
    : [];
  const byId = new Map(reviews.map((r) => [r.id.toString(), r]));

  const items: UsedReviewReportQueueItem[] = reports.map((r) => ({
    id: Number(r.id),
    reviewId: Number(r.reviewId),
    reason: r.reason as UsedReviewReportReason,
    detail: r.detail,
    snapshot: r.snapshot as unknown as UsedReviewReportSnapshot,
    reporterMasked: mask(r.reporterAccountId),
    createdAt: r.createdAt.toISOString(),
    targetStatus: targetStatusOf(byId.get(r.reviewId.toString())),
  }));

  return { items, total, page, pageSize };
}

export function countUnresolvedUsedReviewReports(db: Db = defaultDb): Promise<number> {
  return db.usedReviewReport.count({ where: { resolvedAt: null } });
}

// 후기 숨김 = hidden_* 스탬프 + 그 시점 미해결 신고 일괄 actioned(동일 tx).
export async function hideUsedReview(
  adminId: string,
  input: { reviewId: number; reason: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.reviewId);
  await db.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.usedReview.updateMany({
      where: { id, hiddenAt: null },
      data: { hiddenAt: now, hiddenReason: input.reason, hiddenBy: adminId, updatedAt: now },
    });
    if (updated.count === 0) throw new DomainError("숨길 수 없는 후기입니다");
    await tx.usedReviewReport.updateMany({
      where: { reviewId: id, resolvedAt: null },
      data: { resolution: "actioned", resolvedBy: adminId, resolvedAt: now, updatedAt: now },
    });
  });
}

export async function unhideUsedReview(
  _adminId: string,
  reviewId: number,
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(reviewId);
  const now = new Date();
  const updated = await db.usedReview.updateMany({
    where: { id, hiddenAt: { not: null } },
    data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: now },
  });
  if (updated.count === 0) throw new DomainError("해제할 수 없는 후기입니다");
}

export async function dismissUsedReviewReport(
  adminId: string,
  input: { reportId: number; note?: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.reportId);
  const now = new Date();
  const updated = await db.usedReviewReport.updateMany({
    where: { id, resolvedAt: null },
    data: {
      resolution: "dismissed",
      resolvedBy: adminId,
      resolutionNote: input.note ?? null,
      resolvedAt: now,
      updatedAt: now,
    },
  });
  if (updated.count === 0) throw new DomainError("이미 처리된 신고입니다");
}
