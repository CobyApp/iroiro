import "server-only";

import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";
import { toProduct, toProductPhoto } from "./transform";
import type { ProductFilter } from "./filters";
import { buildListingFacets, type ListingFacets } from "./facets";
import { compareSeriesLabel } from "@/modules/series/lib/kind-options";
import type { Product, ProductPhoto, ProductWithPhotos } from "../types";
import type { Prisma, Product as PrismaProductRow } from "@prisma/client";

export type ProductListResult = {
  items: ProductWithPhotos[];
  total: number;
  page: number;
  pageSize: number;
};

// 카드 연결 상품의 표시 정보(이름·그룹·멤버·시리즈·구분)를 card 에서 실시간으로 덮어쓴다.
// 상품은 가격·재고·상태만 소유하고 토레카 정보는 card 가 단일 소스 — 카탈로그 수정이 즉시 반영된다.
// card_id 가 없는(향후 비카탈로그) 상품은 product 자신의 값을 그대로 쓴다.
async function overlayCardDisplay<T extends ProductWithPhotos>(
  products: T[],
): Promise<T[]> {
  const cardIds = [
    ...new Set(
      products
        .map((p) => p.catalogCardId)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    ),
  ];
  if (cardIds.length === 0) return products;
  const cards = await catalogDb.card.findMany({
    where: { id: { in: cardIds.map((id) => BigInt(id)) } },
    select: {
      id: true,
      name: true,
      itemType: true,
      teamId: true,
      memberId: true,
      seriesId: true,
      frontR2Key: true,
    },
  });
  const byId = new Map(cards.map((c) => [Number(c.id), c]));
  return products.map((p) => {
    if (p.catalogCardId == null) return p;
    const card = byId.get(p.catalogCardId);
    if (!card) return p;
    // 이미지도 카드 앞면(front_r2_key)에서 실시간으로 — 카탈로그 이미지 교체가 즉시 반영된다.
    // 카드 이미지는 products 버킷 cards/wm 에 있어 상품 사진과 같은 공개 베이스로 렌더된다.
    const photos = card.frontR2Key
      ? [
          {
            id: 0,
            r2Key: card.frontR2Key,
            altText: card.name,
            displayOrder: 0,
            isThumbnail: true,
          },
        ]
      : p.photos;
    return {
      ...p,
      name: card.name,
      itemType: card.itemType,
      teamId: card.teamId !== null ? Number(card.teamId) : null,
      memberId: card.memberId !== null ? Number(card.memberId) : null,
      seriesId: card.seriesId !== null ? Number(card.seriesId) : null,
      photos,
    };
  });
}

export async function listProducts(
  filter?: ProductFilter,
): Promise<ProductListResult> {
  // q 검색: team/member 이름까지 후보 ID로 확장
  let teamIdCandidates: bigint[] | null = null;
  let memberIdCandidates: bigint[] | null = null;
  if (filter?.q) {
    const [matchedTeams, matchedMembers] = await Promise.all([
      catalogDb.team.findMany({
        where: { name: { contains: filter.q, mode: "insensitive" } },
        select: { id: true },
      }),
      catalogDb.member.findMany({
        where: { name: { contains: filter.q, mode: "insensitive" } },
        select: { id: true },
      }),
    ]);
    teamIdCandidates = matchedTeams.map((t) => t.id);
    memberIdCandidates = matchedMembers.map((m) => m.id);
  }

  const where: Prisma.ProductWhereInput = {};
  if (filter?.saleStatus) where.saleStatus = filter.saleStatus;
  if (filter?.saleMode) where.saleMode = filter.saleMode;
  // 진행중 경매 제외 — 둘러보기 기본 화면이 상단 '입찰 진행중' 행과 그리드를
  // 분리해 보여줄 때 사용(중복 노출 방지). 종료된 경매(낙찰/유찰)는 그리드에 남는다.
  if (filter?.excludeLiveAuctions) {
    where.NOT = { AND: [{ saleMode: "auction" }, { auctionStatus: "live" }] };
  }
  if (filter?.teamId !== undefined) where.teamId = BigInt(filter.teamId);
  if (filter?.memberId !== undefined)
    where.memberId = BigInt(filter.memberId);
  if (filter?.itemType) where.itemType = filter.itemType;
  if (filter?.condition) where.condition = filter.condition;
  if (filter?.stock === "in_stock") where.stockQuantity = { gt: 0 };
  else if (filter?.stock === "out_of_stock") where.stockQuantity = 0;

  if (filter?.q) {
    const orParts: Prisma.ProductWhereInput[] = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { itemCode: { contains: filter.q, mode: "insensitive" } },
    ];
    if (teamIdCandidates && teamIdCandidates.length > 0) {
      orParts.push({ teamId: { in: teamIdCandidates } });
    }
    if (memberIdCandidates && memberIdCandidates.length > 0) {
      orParts.push({ memberId: { in: memberIdCandidates } });
    }
    where.OR = orParts;
  }

  // salePrice는 NOT NULL이며 할인 없으면 regularPrice와 동일하게 저장 →
  // product_sale_price_idx (B-tree) 가 그대로 활용된다.
  const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
    switch (filter?.sort) {
      case "price_asc":
        return { salePrice: "asc" };
      case "price_desc":
        return { salePrice: "desc" };
      case "stock_desc":
        return { stockQuantity: "desc" };
      case "updated_desc":
        return { updatedAt: "desc" };
      case "newest":
      default:
        return { createdAt: "desc" };
    }
  })();

  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 24;
  const skip = (page - 1) * pageSize;

  let rows: Awaited<ReturnType<typeof db.product.findMany>>;
  let total: number;
  if (filter?.deprioritizeUnavailable) {
    // 구매 불가(품절·종료된 경매)를 항상 뒤로 — 구매 가능 그룹을 먼저 소진한 뒤
    // 이어서 불가 그룹을 페이지네이션한다(그룹 내 정렬은 동일 orderBy).
    const endedAuction = {
      AND: [
        { saleMode: "auction" },
        { auctionStatus: { in: ["awarded", "passed"] } },
      ],
    };
    const availableWhere: Prisma.ProductWhereInput = {
      AND: [where, { stockQuantity: { gt: 0 }, NOT: endedAuction }],
    };
    const unavailableWhere: Prisma.ProductWhereInput = {
      AND: [where, { OR: [{ stockQuantity: 0 }, endedAuction] }],
    };
    const [availTotal, unavailTotal] = await Promise.all([
      db.product.count({ where: availableWhere }),
      db.product.count({ where: unavailableWhere }),
    ]);
    total = availTotal + unavailTotal;
    rows = [];
    if (skip < availTotal) {
      rows.push(
        ...(await db.product.findMany({
          where: availableWhere,
          orderBy,
          skip,
          take: pageSize,
        })),
      );
    }
    const remaining = pageSize - rows.length;
    if (remaining > 0) {
      rows.push(
        ...(await db.product.findMany({
          where: unavailableWhere,
          orderBy,
          skip: Math.max(0, skip - availTotal),
          take: remaining,
        })),
      );
    }
  } else {
    [rows, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);
  }

  // FK 없어 nested select 불가 — 분리 fetch 후 메모리 join
  const productIds = rows.map((r) => r.id);
  const [photoRows, wishRows] = await Promise.all([
    productIds.length
      ? db.productPhoto.findMany({ where: { productId: { in: productIds } } })
      : Promise.resolve([]),
    // 상품별 찜 수 — 리스트 카드에 노출(관심도 지표).
    productIds.length
      ? db.wishlist.groupBy({
          by: ["productId"],
          where: { productId: { in: productIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const photosByProduct = new Map<number, ProductPhoto[]>();
  for (const ph of photoRows) {
    const pid = Number(ph.productId);
    const arr = photosByProduct.get(pid) ?? [];
    arr.push(toProductPhoto(ph));
    photosByProduct.set(pid, arr);
  }
  const wishByProduct = new Map(
    wishRows.map((w) => [Number(w.productId), w._count._all]),
  );

  const items: ProductWithPhotos[] = rows.map((row) => {
    const product = toProduct(row);
    const photos = (photosByProduct.get(product.id) ?? []).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
    return { ...product, photos, wishCount: wishByProduct.get(product.id) ?? 0 };
  });

  return { items: await overlayCardDisplay(items), total, page, pageSize };
}

// 공개 둘러보기 필터 칩용 facet — 목록(/products)과 같은 노출 규칙을 그대로 쓴다:
// sale_status='active' 만(draft·archived 제외). 품절·종료 경매도 목록에 남으므로
// 집계에 포함하고, 재고있음 토글 노출 판단만 stock_quantity > 0 으로 따로 센다.
export async function listProductFacets(): Promise<ListingFacets> {
  const where: Prisma.ProductWhereInput = { saleStatus: "active" };
  const [rows, inStock] = await Promise.all([
    db.product.groupBy({
      by: ["teamId", "memberId", "saleMode"],
      where,
      _count: { _all: true },
    }),
    db.product.count({ where: { ...where, stockQuantity: { gt: 0 } } }),
  ]);
  return buildListingFacets(
    rows.map((r) => ({
      teamId: r.teamId,
      memberId: r.memberId,
      saleMode: r.saleMode,
      count: r._count._all,
    })),
    inStock,
  );
}

// 진행중인 입찰 경매 목록 — 둘러보기 상단 전용 행. 마감 임박순.
export async function listLiveAuctions(
  limit = 12,
): Promise<ProductWithPhotos[]> {
  const rows = await db.product.findMany({
    where: {
      saleStatus: "active",
      saleMode: "auction",
      auctionStatus: "live",
    },
    orderBy: { auctionEndsAt: "asc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  const photoRows = await db.productPhoto.findMany({
    where: { productId: { in: rows.map((r) => r.id) } },
  });
  const photosByProduct = new Map<number, ProductPhoto[]>();
  for (const ph of photoRows) {
    const pid = Number(ph.productId);
    const arr = photosByProduct.get(pid) ?? [];
    arr.push(toProductPhoto(ph));
    photosByProduct.set(pid, arr);
  }
  return overlayCardDisplay(
    rows.map((row) => {
      const product = toProduct(row);
      const photos = (photosByProduct.get(product.id) ?? []).sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      return { ...product, photos };
    }),
  );
}

// 최애(그룹·멤버) 맞춤 상품 — 홈 추천 행. 최애 멤버 or 최애 그룹 소속, 판매중, 최신순.
export async function listProductsForFavorites(
  teamIds: number[],
  memberIds: number[],
  limit = 10,
): Promise<ProductWithPhotos[]> {
  if (teamIds.length === 0 && memberIds.length === 0) return [];
  const or: Prisma.ProductWhereInput[] = [];
  if (memberIds.length > 0)
    or.push({ memberId: { in: memberIds.map(BigInt) } });
  if (teamIds.length > 0) or.push({ teamId: { in: teamIds.map(BigInt) } });

  const rows = await db.product.findMany({
    where: { saleStatus: "active", OR: or },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  const photoRows = await db.productPhoto.findMany({
    where: { productId: { in: rows.map((r) => r.id) } },
  });
  const photosByProduct = new Map<number, ProductPhoto[]>();
  for (const ph of photoRows) {
    const pid = Number(ph.productId);
    const arr = photosByProduct.get(pid) ?? [];
    arr.push(toProductPhoto(ph));
    photosByProduct.set(pid, arr);
  }
  return overlayCardDisplay(
    rows.map((row) => {
      const product = toProduct(row);
      const photos = (photosByProduct.get(product.id) ?? []).sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      return { ...product, photos };
    }),
  );
}

// 여러 상품을 id 목록으로 조회 — 장바구니·주문 페이지가 cart/orders 도메인과 합성할 때 사용.
// (도메인 간 lib 결합을 피하기 위해 소비 측 페이지에서 이 쿼리로 상품 정보를 붙인다.)
export async function getProductsByIds(
  ids: number[],
): Promise<ProductWithPhotos[]> {
  if (ids.length === 0) return [];

  const bigIds = ids.map((id) => BigInt(id));
  const [rows, photoRows] = await Promise.all([
    db.product.findMany({ where: { id: { in: bigIds } } }),
    db.productPhoto.findMany({ where: { productId: { in: bigIds } } }),
  ]);

  const photosByProduct = new Map<number, ProductPhoto[]>();
  for (const ph of photoRows) {
    const pid = Number(ph.productId);
    const arr = photosByProduct.get(pid) ?? [];
    arr.push(toProductPhoto(ph));
    photosByProduct.set(pid, arr);
  }

  return overlayCardDisplay(
    rows.map((row) => {
      const product = toProduct(row);
      const photos = (photosByProduct.get(product.id) ?? []).sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      return { ...product, photos };
    }),
  );
}

// 카탈로그 카드 id → 포즈 번호 맵. 관리자 상품 목록에서 "포즈 N" 표시에 쓴다(카탈로그 DB 조회).
export async function posesByCatalogCard(
  cardIds: number[],
): Promise<Record<number, number>> {
  if (cardIds.length === 0) return {};
  const rows = await catalogDb.card.findMany({
    where: { id: { in: cardIds.map((id) => BigInt(id)) } },
    select: { id: true, pose: true },
  });
  return Object.fromEntries(rows.map((r) => [Number(r.id), r.pose]));
}

export async function getProductById(
  id: number,
): Promise<ProductWithPhotos | null> {
  const [row, photoRows] = await Promise.all([
    db.product.findUnique({ where: { id: BigInt(id) } }),
    db.productPhoto.findMany({ where: { productId: BigInt(id) } }),
  ]);
  if (!row) return null;

  const product = toProduct(row);
  const photos = photoRows
    .map(toProductPhoto)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const [overlaid] = await overlayCardDisplay([{ ...product, photos }]);
  return overlaid;
}

export type DownloadPhoto = {
  id: number;
  r2Key: string;
  displayOrder: number;
};

export type PhotoDownloadContext = {
  productName: string;
  memberName: string | null;
  photo: DownloadPhoto;
};

export type PhotosDownloadContext = {
  productName: string;
  memberName: string | null;
  photos: DownloadPhoto[];
};

async function lookupMemberName(
  memberId: bigint | null,
): Promise<string | null> {
  if (memberId === null) return null;
  const member = await catalogDb.member.findUnique({
    where: { id: memberId },
    select: { name: true },
  });
  return member?.name ?? null;
}

export async function getPhotoDownloadContext(
  productId: number,
  photoId: number,
): Promise<PhotoDownloadContext | null> {
  const [product, photo] = await Promise.all([
    db.product.findUnique({
      where: { id: BigInt(productId) },
      select: { id: true, name: true, memberId: true },
    }),
    db.productPhoto.findUnique({
      where: { id: BigInt(photoId) },
      select: { id: true, productId: true, r2Key: true, displayOrder: true },
    }),
  ]);

  if (!product || !photo) return null;
  if (Number(photo.productId) !== productId) return null;

  return {
    productName: product.name,
    memberName: await lookupMemberName(product.memberId),
    photo: {
      id: Number(photo.id),
      r2Key: photo.r2Key,
      displayOrder: photo.displayOrder,
    },
  };
}

export async function getPhotosDownloadContext(
  productId: number,
): Promise<PhotosDownloadContext | null> {
  const product = await db.product.findUnique({
    where: { id: BigInt(productId) },
    select: { id: true, name: true, memberId: true },
  });
  if (!product) return null;

  const photoRows = await db.productPhoto.findMany({
    where: { productId: BigInt(productId) },
    select: { id: true, r2Key: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });

  return {
    productName: product.name,
    memberName: await lookupMemberName(product.memberId),
    photos: photoRows.map((ph) => ({
      id: Number(ph.id),
      r2Key: ph.r2Key,
      displayOrder: ph.displayOrder,
    })),
  };
}

// ── 같은 카드의 다른 매물 · 연관 추천 (상세 페이지) ─────────────────────────────

export type SiblingListing = {
  id: number;
  condition: Product["condition"];
  saleMode: Product["saleMode"];
  saleStatus: Product["saleStatus"];
  stockQuantity: number;
  salePrice: number;
  regularPrice: number;
  auctionCurrentPrice: number | null;
  auctionStartPrice: number | null;
  auctionStatus: Product["auctionStatus"];
  auctionEndsAt: string | null;
};

// 같은 카드(item_code 기준)의 "다른" 판매중 매물.
// 컨디션이 다르거나 정가·경매를 병행하면 각각 별개 매물로 노출된다.
export async function listSiblingListings(product: {
  id: number;
  itemCode: string | null;
}): Promise<SiblingListing[]> {
  const cardKey: Prisma.ProductWhereInput | null = product.itemCode
    ? { itemCode: product.itemCode }
    : null;
  if (!cardKey) return [];

  const rows = await db.product.findMany({
    where: {
      ...cardKey,
      id: { not: BigInt(product.id) },
      saleStatus: "active",
    },
    orderBy: [{ salePrice: "asc" }, { id: "asc" }],
    take: 12,
    select: {
      id: true,
      condition: true,
      saleMode: true,
      saleStatus: true,
      stockQuantity: true,
      salePrice: true,
      regularPrice: true,
      auctionCurrentPrice: true,
      auctionStartPrice: true,
      auctionStatus: true,
      auctionEndsAt: true,
    },
  });
  return rows.map((r) => ({
    id: Number(r.id),
    condition: r.condition as Product["condition"],
    saleMode: r.saleMode as Product["saleMode"],
    saleStatus: r.saleStatus as Product["saleStatus"],
    stockQuantity: r.stockQuantity,
    salePrice: r.salePrice,
    regularPrice: r.regularPrice,
    auctionCurrentPrice: r.auctionCurrentPrice,
    auctionStartPrice: r.auctionStartPrice,
    auctionStatus: r.auctionStatus as Product["auctionStatus"],
    auctionEndsAt: r.auctionEndsAt?.toISOString() ?? null,
  }));
}

// 연관 추천 — 같은 멤버 → 같은 시리즈 → 같은 그룹 순으로 판매중 상품을 채운다.
// 자기 자신·같은 카드 매물은 제외(형제 매물 섹션이 따로 있으므로 중복 노출 방지).
export async function listRelatedProducts(
  product: {
    id: number;
    itemCode: string | null;
    memberId: number | null;
    seriesId: number | null;
    teamId: number | null;
  },
  limit = 8,
): Promise<ProductWithPhotos[]> {
  const excludeCard: Prisma.ProductWhereInput = product.itemCode
    ? { NOT: { itemCode: product.itemCode } }
    : { id: { not: BigInt(product.id) } };

  const tiers: Prisma.ProductWhereInput[] = [];
  if (product.memberId !== null) {
    tiers.push({ memberId: BigInt(product.memberId) });
  }
  if (product.seriesId !== null) {
    tiers.push({ seriesId: BigInt(product.seriesId) });
  }
  if (product.teamId !== null) {
    tiers.push({ teamId: BigInt(product.teamId) });
  }

  const picked: PrismaProductRow[] = [];
  const pickedIds = new Set<bigint>([BigInt(product.id)]);
  for (const tier of tiers) {
    if (picked.length >= limit) break;
    const rows = await db.product.findMany({
      where: {
        ...tier,
        ...excludeCard,
        saleStatus: "active",
        id: { notIn: [...pickedIds] },
      },
      orderBy: { createdAt: "desc" },
      take: limit - picked.length,
    });
    for (const row of rows) {
      picked.push(row);
      pickedIds.add(row.id);
    }
  }
  if (picked.length === 0) return [];

  const photoRows = await db.productPhoto.findMany({
    where: { productId: { in: picked.map((r) => r.id) } },
  });
  const photosByProduct = new Map<number, ProductPhoto[]>();
  for (const ph of photoRows) {
    const pid = Number(ph.productId);
    const arr = photosByProduct.get(pid) ?? [];
    arr.push(toProductPhoto(ph));
    photosByProduct.set(pid, arr);
  }
  return overlayCardDisplay(
    picked.map((row) => {
      const p = toProduct(row);
      const photos = (photosByProduct.get(p.id) ?? []).sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      return { ...p, photos };
    }),
  );
}

// ── 시리즈 옵션 (중고 등록·필터용) ──────────────────────────────────────────

export type SeriesOption = {
  id: number;
  sku: string;
  kind: string;
  label: string;
  /** 한국어 병기(series.label_i18n.ko) — 없으면 null. 고객 화면은 이 값을 우선 노출한다. */
  labelKo: string | null;
  teamId: number | null;
  /** 이 시리즈 카탈로그 상품의 외부 시세 평균(JPY) — 0이면 정보 없음 */
  marketAvgJpy: number;
};

// series.label_i18n.ko 추출(문자열이 아니면 null).
function seriesKoLabel(labelI18n: unknown): string | null {
  if (!labelI18n || typeof labelI18n !== "object") return null;
  const ko = (labelI18n as Record<string, unknown>).ko;
  return typeof ko === "string" && ko.trim() ? ko : null;
}

// 시리즈 목록 + 시리즈별 시세 평균(연결된 카탈로그 상품 기준).
export async function listSeriesOptions(): Promise<SeriesOption[]> {
  const [seriesRows, avgRows] = await Promise.all([
    catalogDb.series.findMany({ orderBy: [{ kind: "asc" }, { label: "asc" }] }),
    db.product.groupBy({
      by: ["seriesId"],
      where: { seriesId: { not: null }, marketAvgJpy: { gt: 0 } },
      _avg: { marketAvgJpy: true },
    }),
  ]);
  const avgBy = new Map(
    avgRows.map((r) => [Number(r.seriesId), Math.round(r._avg.marketAvgJpy ?? 0)]),
  );
  return seriesRows
    .map((s) => {
      const ko = seriesKoLabel(s.labelI18n);
      return {
        id: Number(s.id),
        sku: s.sku,
        kind: s.kind,
        // 고객·선택 화면은 한국어 병기(label_i18n.ko)를 우선 노출 — 없으면 원문(대개 일본어).
        label: ko ?? s.label,
        labelKo: ko,
        teamId: s.teamId !== null ? Number(s.teamId) : null,
        marketAvgJpy: avgBy.get(Number(s.id)) ?? 0,
      };
    })
    // ver.1·ver.2·…·ver.10 자연 정렬(문자열순 아님).
    .sort((a, b) => a.kind.localeCompare(b.kind) || compareSeriesLabel(a.label, b.label));
}
