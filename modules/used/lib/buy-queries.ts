import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type {
  BuyOfferStatus,
  BuyRequestStatus,
  UsedBuyOfferWithMeta,
  UsedBuyRequest,
  UsedBuyRequestWithMeta,
} from "../buy-types";
import type { ProductCondition } from "@/modules/products/types";

export type BuyRequestFilter = {
  teamId?: number;
  memberId?: number;
  q?: string;
  /** 요청자 계정 — 내 삽니다 목록. */
  requesterAccountId?: string;
  page?: number;
  pageSize?: number;
};

function toBuyRequest(
  row: Prisma.UsedBuyRequestGetPayload<object>,
): UsedBuyRequest {
  return {
    id: Number(row.id),
    requesterAccountId: row.requesterAccountId,
    itemType: row.itemType,
    teamId: row.teamId != null ? Number(row.teamId) : null,
    memberId: row.memberId != null ? Number(row.memberId) : null,
    seriesId: row.seriesId != null ? Number(row.seriesId) : null,
    sourceProductId: row.sourceProductId != null ? Number(row.sourceProductId) : null,
    title: row.title,
    description: row.description,
    minCondition: (row.minCondition as ProductCondition | null) ?? null,
    budget: row.budget,
    quantity: row.quantity,
    status: row.status as BuyRequestStatus,
    offerCount: row.offerCount,
    viewCount: row.viewCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// 요청자 닉네임 + 그룹/멤버 이름을 붙인다(카탈로그 join 대체 — id 목록으로 따로 조회 후 앱에서 합침).
async function attachMeta(
  rows: Prisma.UsedBuyRequestGetPayload<object>[],
): Promise<UsedBuyRequestWithMeta[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const accountIds = [...new Set(rows.map((r) => r.requesterAccountId))];
  const teamIds = [...new Set(rows.map((r) => r.teamId).filter((v): v is bigint => v != null))];
  const memberIds = [...new Set(rows.map((r) => r.memberId).filter((v): v is bigint => v != null))];
  const [accounts, teams, members, photos] = await Promise.all([
    db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, displayName: true },
    }),
    teamIds.length
      ? db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    memberIds.length
      ? db.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    db.usedBuyRequestPhoto.findMany({
      where: { requestId: { in: ids } },
      orderBy: { displayOrder: "asc" },
      select: { requestId: true, r2Key: true },
    }),
  ]);
  const nameBy = new Map(accounts.map((a) => [a.id, a.displayName]));
  const teamBy = new Map(teams.map((t) => [Number(t.id), t.name]));
  const memberBy = new Map(members.map((m) => [Number(m.id), m.name]));
  const imagesBy = new Map<number, string[]>();
  for (const p of photos) {
    const key = Number(p.requestId);
    const arr = imagesBy.get(key) ?? [];
    arr.push(p.r2Key);
    imagesBy.set(key, arr);
  }
  return rows.map((row) => {
    const base = toBuyRequest(row);
    return {
      ...base,
      requesterName: nameBy.get(row.requesterAccountId) ?? "구매 희망자",
      teamName: base.teamId != null ? (teamBy.get(base.teamId) ?? null) : null,
      memberName: base.memberId != null ? (memberBy.get(base.memberId) ?? null) : null,
      imageKeys: imagesBy.get(Number(row.id)) ?? [],
    };
  });
}

// 고객에게 보이는 삽니다 — 모집중(open) + 성사(fulfilled). 차단·종료는 목록에서 제외.
const LIVE_STATUS: BuyRequestStatus[] = ["open", "fulfilled"];

export async function listBuyRequests(
  filter: BuyRequestFilter = {},
): Promise<{ items: UsedBuyRequestWithMeta[]; total: number }> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 24;
  const where: Prisma.UsedBuyRequestWhereInput = filter.requesterAccountId
    ? { requesterAccountId: filter.requesterAccountId, status: { not: "blocked" } }
    : { status: { in: LIVE_STATUS } };
  if (filter.teamId !== undefined) where.teamId = BigInt(filter.teamId);
  if (filter.memberId !== undefined) where.memberId = BigInt(filter.memberId);
  if (filter.q) {
    where.OR = [
      { title: { contains: filter.q, mode: "insensitive" } },
      { description: { contains: filter.q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    db.usedBuyRequest.count({ where }),
    db.usedBuyRequest.findMany({
      where,
      // 모집중을 위로, 그다음 최신순.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: await attachMeta(rows), total };
}

// 삽니다 facet(그룹/멤버 칩) — 목록과 같은 노출 규칙(open+fulfilled).
export async function listBuyRequestFacets(): Promise<{
  teamIds: number[];
  memberIdsByTeam: Record<number, number[]>;
}> {
  const rows = await db.usedBuyRequest.groupBy({
    by: ["teamId", "memberId"],
    where: { status: { in: LIVE_STATUS } },
    _count: { _all: true },
  });
  const teamIds = new Set<number>();
  const memberIdsByTeam: Record<number, number[]> = {};
  for (const r of rows) {
    if (r.teamId != null) {
      const t = Number(r.teamId);
      teamIds.add(t);
      if (r.memberId != null) {
        (memberIdsByTeam[t] ??= []).push(Number(r.memberId));
      }
    }
  }
  return { teamIds: [...teamIds], memberIdsByTeam };
}

export async function getBuyRequestById(
  id: number,
): Promise<UsedBuyRequestWithMeta | null> {
  const row = await db.usedBuyRequest.findUnique({ where: { id: BigInt(id) } });
  if (!row) return null;
  const [meta] = await attachMeta([row]);
  return meta ?? null;
}

// 요청 상세의 오퍼 목록 — 판매자 닉네임 + 연결 매물 제목/대표사진. 철회는 제외.
export async function listOffersForRequest(
  requestId: number,
): Promise<UsedBuyOfferWithMeta[]> {
  const rows = await db.usedBuyOffer.findMany({
    where: { requestId: BigInt(requestId), status: { not: "withdrawn" } },
    // 수락된 오퍼를 위로, 그다음 최신순.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  if (rows.length === 0) return [];
  const sellerIds = [...new Set(rows.map((r) => r.sellerAccountId))];
  const listingIds = [...new Set(rows.map((r) => r.listingId).filter((v): v is bigint => v != null))];
  const [sellers, listings, photos] = await Promise.all([
    db.account.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, displayName: true },
    }),
    listingIds.length
      ? db.usedListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true, status: true },
        })
      : Promise.resolve([]),
    listingIds.length
      ? db.usedListingPhoto.findMany({
          where: { listingId: { in: listingIds }, isPrimary: true },
          select: { listingId: true, r2Key: true },
        })
      : Promise.resolve([]),
  ]);
  const nameBy = new Map(sellers.map((s) => [s.id, s.displayName]));
  const listingBy = new Map(listings.map((l) => [Number(l.id), l]));
  const photoBy = new Map(photos.map((p) => [Number(p.listingId), p.r2Key]));
  return rows.map((row) => {
    const lid = row.listingId != null ? Number(row.listingId) : null;
    const listing = lid != null ? listingBy.get(lid) : undefined;
    return {
      id: Number(row.id),
      requestId: Number(row.requestId),
      sellerAccountId: row.sellerAccountId,
      listingId: lid,
      price: row.price,
      message: row.message,
      status: row.status as BuyOfferStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sellerName: nameBy.get(row.sellerAccountId) ?? "판매자",
      listingTitle: listing?.title ?? null,
      listingPrimaryKey: lid != null ? (photoBy.get(lid) ?? null) : null,
      listingStatus: listing?.status ?? null,
    };
  });
}

// 판매자가 이 요청에 이미 낸 활성 오퍼(있으면) — 상세에서 중복 제출 방지·표시.
export async function getMyOfferForRequest(
  requestId: number,
  sellerAccountId: string,
): Promise<{ id: number; price: number; status: BuyOfferStatus } | null> {
  const row = await db.usedBuyOffer.findFirst({
    where: {
      requestId: BigInt(requestId),
      sellerAccountId,
      status: { not: "withdrawn" },
    },
    select: { id: true, price: true, status: true },
  });
  return row
    ? { id: Number(row.id), price: row.price, status: row.status as BuyOfferStatus }
    : null;
}

// 내가 보낸 오퍼 목록(마이페이지) — 대상 요청 제목·상태 포함.
export async function listMyOffers(
  sellerAccountId: string,
): Promise<
  (UsedBuyOfferWithMeta & { requestTitle: string; requestStatus: BuyRequestStatus })[]
> {
  const rows = await db.usedBuyOffer.findMany({
    where: { sellerAccountId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (rows.length === 0) return [];
  const requestIds = [...new Set(rows.map((r) => r.requestId))];
  const requests = await db.usedBuyRequest.findMany({
    where: { id: { in: requestIds } },
    select: { id: true, title: true, status: true },
  });
  const reqBy = new Map(requests.map((r) => [Number(r.id), r]));
  return rows.map((row) => {
    const req = reqBy.get(Number(row.requestId));
    return {
      id: Number(row.id),
      requestId: Number(row.requestId),
      sellerAccountId: row.sellerAccountId,
      listingId: row.listingId != null ? Number(row.listingId) : null,
      price: row.price,
      message: row.message,
      status: row.status as BuyOfferStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sellerName: "",
      listingTitle: null,
      listingPrimaryKey: null,
      listingStatus: null,
      requestTitle: req?.title ?? "(삭제된 요청)",
      requestStatus: (req?.status as BuyRequestStatus) ?? "closed",
    };
  });
}

// 관리자 삽니다 목록 — 상태 필터·페이지네이션. 요청자 닉네임·그룹/멤버 포함.
export async function listBuyRequestsForAdmin(
  status: BuyRequestStatus | undefined,
  page = 1,
  pageSize = 30,
): Promise<{ items: UsedBuyRequestWithMeta[]; total: number }> {
  const where: Prisma.UsedBuyRequestWhereInput = status ? { status } : {};
  const [total, rows] = await Promise.all([
    db.usedBuyRequest.count({ where }),
    db.usedBuyRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: await attachMeta(rows), total };
}

// 판매자가 오퍼에 연결할 수 있는 내 판매중 매물(드롭다운) — active 만.
export async function listMyActiveListingsForOffer(
  sellerAccountId: string,
): Promise<{ id: number; title: string }[]> {
  const rows = await db.usedListing.findMany({
    where: { sellerAccountId, status: "active" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true },
  });
  return rows.map((r) => ({ id: Number(r.id), title: r.title }));
}
