import "server-only";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { assertWithinRateLimit } from "@/modules/posts/lib/rate-limit";
import type {
  AdminUsedListingRow,
  UsedReportQueueItem,
  UsedReportReason,
  UsedReportSnapshot,
  UsedSaleMode,
  UsedStatus,
  UsedReportTargetStatus,
} from "../types";

// 중고 매물 신고의 순수 DB 로직 — 액션(가드·revalidate)과 분리해 단위 테스트를 붙인다.
// 글 신고(modules/posts/lib/mutations)와 같은 계약: 대상 잠금 + 노출 재검증 + 스냅샷 동결,
// 처리(차단/기각)는 미해결 신고만 원자적으로 resolve 한다.

type Db = typeof defaultDb;

export const USED_REPORT_PAGE_SIZE = 20;

// 신고 rate limit(글 신고와 동일 정책) — 이중 윈도(10분 5건 / 하루 20건).
const USED_REPORT_RATE = [
  { seconds: 600, max: 5 },
  { seconds: 86_400, max: 20 },
] as const;

const reportCounter = (db: Db, reporterAccountId: string) => (since: Date) =>
  db.usedReport.count({ where: { reporterAccountId, createdAt: { gte: since } } });

export type UsedReportQueuePage = {
  items: UsedReportQueueItem[];
  total: number;
  page: number;
  pageSize: number;
};

// 매물 status → 신고 큐 표시 상태.
function targetStatusOf(status: string | undefined): UsedReportTargetStatus {
  if (!status) return "missing";
  if (status === "blocked") return "blocked";
  if (status === "sold") return "sold";
  if (status === "canceled") return "missing";
  return "visible"; // active | reserved
}

const mask = (accountId: string) => `#${accountId.slice(-4)}`;

// 고객 신고 접수 — 대상 매물 FOR UPDATE 잠금 하에 노출 재검증 + 스냅샷 동결.
export async function createUsedReport(
  reporterAccountId: string,
  input: { listingId: number; reason: string; detail?: string },
  db: Db = defaultDb,
): Promise<void> {
  const listingId = BigInt(input.listingId);
  await assertWithinRateLimit(USED_REPORT_RATE, reportCounter(db, reporterAccountId));
  try {
    await db.$transaction(async (tx) => {
      // 매물 행만 잠근다(FOR UPDATE OF l) — 판매자 account 는 라이브 조회로 이름을 동결한다.
      // 차단·취소된 매물은 신고 불가(이미 내려간 매물). block tx 와 직렬화된다.
      const rows = await tx.$queryRaw<
        {
          seller_account_id: string;
          title: string;
          description: string | null;
          price: number | null;
          sale_mode: string;
          seller_name: string;
          seller_code: string;
          updated_at: Date;
        }[]
      >`
        SELECT l.seller_account_id, l.title, l.description, l.price, l.sale_mode,
               COALESCE(a.display_name, '(알 수 없음)') AS seller_name,
               COALESCE(a.public_code, '-')            AS seller_code,
               l.updated_at
        FROM used_listing l
        LEFT JOIN account a ON a.id = l.seller_account_id
        WHERE l.id = ${listingId} AND l.status NOT IN ('blocked', 'canceled')
        FOR UPDATE OF l`;
      const listing = rows[0];
      if (!listing) throw new DomainError("신고할 수 없는 매물입니다");
      if (listing.seller_account_id === reporterAccountId) {
        throw new DomainError("본인 매물은 신고할 수 없습니다");
      }
      const primary = await tx.usedListingPhoto.findFirst({
        where: { listingId, isPrimary: true },
        select: { r2Key: true },
      });
      // 스냅샷은 인라인 객체 리터럴로 — Prisma Json 필드는 InputJsonValue 로 문맥 추론된다.
      await tx.usedReport.create({
        data: {
          listingId,
          reporterAccountId,
          reason: input.reason,
          detail: input.detail ?? null,
          snapshot: {
            version: 1,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            saleMode: listing.sale_mode === "auction" ? "auction" : "fixed",
            sellerName: listing.seller_name,
            sellerCode: listing.seller_code,
            primaryPhotoKey: primary?.r2Key ?? null,
            updatedAt: listing.updated_at.toISOString(),
          } satisfies UsedReportSnapshot,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolationOn(error, "listing_id")) {
      throw new DomainError("이미 신고한 매물입니다");
    }
    throw error;
  }
}

// 미해결 신고 큐 — 대상 매물의 현재 상태를 함께 붙여 반환.
export async function listUsedReportQueue(
  page = 1,
  pageSize = USED_REPORT_PAGE_SIZE,
  db: Db = defaultDb,
): Promise<UsedReportQueuePage> {
  const [total, reports] = await Promise.all([
    db.usedReport.count({ where: { resolvedAt: null } }),
    db.usedReport.findMany({
      where: { resolvedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const listingIds = [...new Set(reports.map((r) => r.listingId))];
  const listings = listingIds.length
    ? await db.usedListing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, status: true },
      })
    : [];
  const statusById = new Map(listings.map((l) => [l.id.toString(), l.status]));

  const items: UsedReportQueueItem[] = reports.map((r) => ({
    id: Number(r.id),
    listingId: Number(r.listingId),
    reason: r.reason as UsedReportReason,
    detail: r.detail,
    snapshot: r.snapshot as unknown as UsedReportSnapshot,
    reporterMasked: mask(r.reporterAccountId),
    createdAt: r.createdAt.toISOString(),
    targetStatus: targetStatusOf(statusById.get(r.listingId.toString())),
  }));

  return { items, total, page, pageSize };
}

// 대시보드 배지용 — 미해결 신고 수.
export function countUnresolvedUsedReports(db: Db = defaultDb): Promise<number> {
  return db.usedReport.count({ where: { resolvedAt: null } });
}

// 매물 차단 = status='blocked' 스탬프 + 그 시점 미해결 신고 일괄 actioned(동일 tx).
// 이미 차단·판매완료·취소된 매물은 차단 불가(활성/거래중만).
export async function blockUsedListing(
  adminId: string,
  input: { listingId: number; reason: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.listingId);
  await db.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.usedListing.updateMany({
      where: { id, status: { in: ["active", "reserved"] } },
      data: {
        status: "blocked",
        blockedAt: now,
        blockedReason: input.reason,
        blockedBy: adminId,
        updatedAt: now,
      },
    });
    if (updated.count === 0) throw new DomainError("차단할 수 없는 매물입니다");
    await tx.usedReport.updateMany({
      where: { listingId: id, resolvedAt: null },
      data: { resolution: "actioned", resolvedBy: adminId, resolvedAt: now, updatedAt: now },
    });
  });
}

// 차단 해제 = status 를 active 로 복원 + 차단 스탬프 제거. (직전 상태는 저장하지 않아 active 로 복귀)
export async function unblockUsedListing(
  _adminId: string,
  listingId: number,
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(listingId);
  const now = new Date();
  const updated = await db.usedListing.updateMany({
    where: { id, status: "blocked" },
    data: {
      status: "active",
      blockedAt: null,
      blockedReason: null,
      blockedBy: null,
      updatedAt: now,
    },
  });
  if (updated.count === 0) throw new DomainError("해제할 수 없는 매물입니다");
}

export const ADMIN_LISTING_PAGE_SIZE = 20;

export type AdminUsedListingPage = {
  items: AdminUsedListingRow[];
  total: number;
  page: number;
  pageSize: number;
};

// 관리자 매물 목록 — status 로 좁힐 수 있고, 사진 1장·판매자·미해결 신고 수를 붙인다.
export async function listAdminUsedListings(
  opts: { status?: UsedStatus; page?: number; pageSize?: number } = {},
  db: Db = defaultDb,
): Promise<AdminUsedListingPage> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? ADMIN_LISTING_PAGE_SIZE;
  const where = opts.status ? { status: opts.status } : {};
  const [total, rows] = await Promise.all([
    db.usedListing.count({ where }),
    db.usedListing.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  if (rows.length === 0) return { items: [], total, page, pageSize };

  const ids = rows.map((r) => r.id);
  const sellerIds = [...new Set(rows.map((r) => r.sellerAccountId))];
  const [photos, sellers, reportGroups] = await Promise.all([
    db.usedListingPhoto.findMany({
      where: { listingId: { in: ids }, isPrimary: true },
      select: { listingId: true, r2Key: true },
    }),
    db.account.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, displayName: true },
    }),
    db.usedReport.groupBy({
      by: ["listingId"],
      where: { listingId: { in: ids }, resolvedAt: null },
      _count: { _all: true },
    }),
  ]);
  const photoBy = new Map(photos.map((p) => [p.listingId.toString(), p.r2Key]));
  const sellerBy = new Map(sellers.map((s) => [s.id, s.displayName]));
  const reportBy = new Map(reportGroups.map((g) => [g.listingId.toString(), g._count._all]));

  const items: AdminUsedListingRow[] = rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    status: r.status as UsedStatus,
    saleMode: (r.saleMode === "auction" ? "auction" : "fixed") as UsedSaleMode,
    price: r.price,
    sellerAccountId: r.sellerAccountId,
    sellerName: sellerBy.get(r.sellerAccountId) ?? "(알 수 없음)",
    primaryPhotoKey: photoBy.get(r.id.toString()) ?? null,
    openReports: reportBy.get(r.id.toString()) ?? 0,
    blockedReason: r.blockedReason,
    createdAt: r.createdAt.toISOString(),
  }));
  return { items, total, page, pageSize };
}

// 대시보드 카운트 — 활성(판매중·거래중) 매물 수, 차단 매물 수.
export async function countUsedListingsByStatus(
  db: Db = defaultDb,
): Promise<{ active: number; blocked: number }> {
  const [active, blocked] = await Promise.all([
    db.usedListing.count({ where: { status: { in: ["active", "reserved"] } } }),
    db.usedListing.count({ where: { status: "blocked" } }),
  ]);
  return { active, blocked };
}

// 단독 resolve = dismissed 전용(actioned 는 차단 tx 에서만) — 이미 처리된 신고는 거부.
export async function dismissUsedReport(
  adminId: string,
  input: { reportId: number; note?: string },
  db: Db = defaultDb,
): Promise<void> {
  const id = BigInt(input.reportId);
  const now = new Date();
  const updated = await db.usedReport.updateMany({
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
