import "server-only";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { assertWithinRateLimit } from "@/modules/posts/lib/rate-limit";
import type {
  ProductReviewReportQueueItem,
  ProductReviewReportSnapshot,
  ReviewReportReason,
  ReviewReportTargetStatus,
} from "../types";

// 스토어 상품 리뷰 신고의 순수 DB 로직 — 액션(가드·revalidate)과 분리해 단위 테스트를 붙인다.
// 중고 매물 신고(modules/used/lib/report)와 같은 계약: 대상 잠금 + 노출 재검증 + 스냅샷 동결,
// 처리(숨김/기각)는 미해결 신고만 원자적으로 resolve 한다.

type Db = typeof defaultDb;

export const REVIEW_REPORT_PAGE_SIZE = 20;

// 신고 rate limit(글/중고 신고와 동일 정책) — 이중 윈도(10분 5건 / 하루 20건).
const REVIEW_REPORT_RATE = [
  { seconds: 600, max: 5 },
  { seconds: 86_400, max: 20 },
] as const;

const reportCounter = (db: Db, reporterAccountId: string) => (since: Date) =>
  db.productReviewReport.count({
    where: { reporterAccountId, createdAt: { gte: since } },
  });

export type ReviewReportQueuePage = {
  items: ProductReviewReportQueueItem[];
  total: number;
  page: number;
  pageSize: number;
};

const mask = (accountId: string) => `#${accountId.slice(-4)}`;

// 고객 신고 접수 — 대상 리뷰 FOR UPDATE 잠금 하에 노출(미숨김) 재검증 + 스냅샷 동결.
export async function createProductReviewReport(
  reporterAccountId: string,
  input: { reviewId: number; reason: string; detail?: string },
  db: Db = defaultDb,
): Promise<void> {
  const reviewId = BigInt(input.reviewId);
  await assertWithinRateLimit(REVIEW_REPORT_RATE, reportCounter(db, reporterAccountId));
  try {
    await db.$transaction(async (tx) => {
      // 숨김 처리된 리뷰는 신고 불가(이미 내려간 리뷰). 숨김 tx 와 직렬화된다.
      const rows = await tx.$queryRaw<
        {
          account_id: string;
          rating: number;
          body: string;
          product_id: bigint;
          product_name: string;
          reviewer_name: string;
          created_at: Date;
        }[]
      >`
        SELECT r.account_id, r.rating, r.body, r.product_id,
               COALESCE(p.name, '(삭제된 상품)')  AS product_name,
               COALESCE(a.display_name, '(탈퇴 회원)') AS reviewer_name,
               r.created_at
        FROM product_review r
        LEFT JOIN product p ON p.id = r.product_id
        LEFT JOIN account a ON a.id = r.account_id
        WHERE r.id = ${reviewId} AND r.hidden_at IS NULL
        FOR UPDATE OF r`;
      const review = rows[0];
      if (!review) throw new DomainError("신고할 수 없는 리뷰입니다");
      if (review.account_id === reporterAccountId) {
        throw new DomainError("본인 리뷰는 신고할 수 없습니다");
      }
      await tx.productReviewReport.create({
        data: {
          reviewId,
          reporterAccountId,
          reason: input.reason,
          detail: input.detail ?? null,
          snapshot: {
            version: 1,
            rating: review.rating,
            body: review.body,
            productId: Number(review.product_id),
            productName: review.product_name,
            reviewerName: review.reviewer_name,
            createdAt: review.created_at.toISOString(),
          } satisfies ProductReviewReportSnapshot,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "review_id")) {
      throw new DomainError("이미 신고한 리뷰입니다");
    }
    throw error;
  }
}

function targetStatusOf(
  found: { hiddenAt: Date | null } | undefined,
): ReviewReportTargetStatus {
  if (!found) return "missing";
  return found.hiddenAt ? "hidden" : "visible";
}

// 미해결 신고 큐 — 대상 리뷰의 현재 상태를 함께 붙여 반환.
export async function listProductReviewReportQueue(
  page = 1,
  pageSize = REVIEW_REPORT_PAGE_SIZE,
  db: Db = defaultDb,
): Promise<ReviewReportQueuePage> {
  const [total, reports] = await Promise.all([
    db.productReviewReport.count({ where: { resolvedAt: null } }),
    db.productReviewReport.findMany({
      where: { resolvedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const reviewIds = [...new Set(reports.map((r) => r.reviewId))];
  const reviews = reviewIds.length
    ? await db.productReview.findMany({
        where: { id: { in: reviewIds } },
        select: { id: true, hiddenAt: true },
      })
    : [];
  const byId = new Map(reviews.map((r) => [r.id.toString(), r]));

  const items: ProductReviewReportQueueItem[] = reports.map((r) => ({
    id: Number(r.id),
    reviewId: Number(r.reviewId),
    reason: r.reason as ReviewReportReason,
    detail: r.detail,
    snapshot: r.snapshot as unknown as ProductReviewReportSnapshot,
    reporterMasked: mask(r.reporterAccountId),
    createdAt: r.createdAt.toISOString(),
    targetStatus: targetStatusOf(byId.get(r.reviewId.toString())),
  }));

  return { items, total, page, pageSize };
}

// 대시보드 배지용 — 미해결 신고 수.
export function countUnresolvedProductReviewReports(db: Db = defaultDb): Promise<number> {
  return db.productReviewReport.count({ where: { resolvedAt: null } });
}

// 리뷰 숨김 = hidden_* 스탬프 + 그 시점 미해결 신고 일괄 actioned(동일 tx).
export async function hideProductReview(
  adminId: string,
  input: { reviewId: number; reason: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.reviewId);
  await db.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.productReview.updateMany({
      where: { id, hiddenAt: null },
      data: {
        hiddenAt: now,
        hiddenReason: input.reason,
        hiddenBy: adminId,
        updatedAt: now,
      },
    });
    if (updated.count === 0) throw new DomainError("숨길 수 없는 리뷰입니다");
    await tx.productReviewReport.updateMany({
      where: { reviewId: id, resolvedAt: null },
      data: { resolution: "actioned", resolvedBy: adminId, resolvedAt: now, updatedAt: now },
    });
  });
}

// 숨김 해제 = hidden_* 제거(리뷰가 다시 노출된다).
export async function unhideProductReview(
  _adminId: string,
  reviewId: number,
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(reviewId);
  const now = new Date();
  const updated = await db.productReview.updateMany({
    where: { id, hiddenAt: { not: null } },
    data: { hiddenAt: null, hiddenReason: null, hiddenBy: null, updatedAt: now },
  });
  if (updated.count === 0) throw new DomainError("해제할 수 없는 리뷰입니다");
}

// 단독 resolve = dismissed 전용(actioned 는 숨김 tx 에서만) — 이미 처리된 신고는 거부.
export async function dismissProductReviewReport(
  adminId: string,
  input: { reportId: number; note?: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.reportId);
  const now = new Date();
  const updated = await db.productReviewReport.updateMany({
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
