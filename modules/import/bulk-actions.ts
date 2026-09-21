"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { todayKstYmd } from "@/lib/datetime";
import { createProduct } from "@/modules/products/actions";
import { fetchJpyKrwRate, jpyToKrwPrice } from "@/modules/products/lib/fx";
import { listImportedSourceIds } from "@/modules/products/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import {
  buildImportPrefill,
  type MemberRef,
  type TeamRef,
} from "./lib/mapping";
import {
  resolveImportRefs,
  resolveSeriesId,
  type RefsCache,
} from "./lib/resolve-refs";
import {
  fetchExternalCards,
  type ExternalCard,
} from "./lib/cutie-card";
import { copyImageToR2 } from "./lib/copy-image";

// 전체 삭제 확인 문구 — 클라이언트 게이트와 동일해야 통과.
const PURGE_CONFIRM_WORD = "전체삭제";

export type PurgePreview = {
  products: number;
  photos: number;
  cartItems: number;
  wishlists: number;
  // 아래는 삭제하지 않고 "고아가 될 수 있음"만 안내.
  // inventory_item = 구매 결과 원장. 컬렉션 카드의 이름·썸네일·수량이 여기서 나오므로
  // 지우면 컬렉션이 빈 채로 보인다(활성 0 등록 제외). order_item과 같은 계열로 보존한다.
  inventoryItems: number;
  orderItems: number;
  collectionItems: number;
};

// 초기화 화면 상단 — 삭제 대상/영향 행 수 미리보기.
export async function getPurgePreview(): Promise<PurgePreview> {
  await requireAdmin();
  const [
    products,
    photos,
    cartItems,
    inventoryItems,
    wishlists,
    orderItems,
    collectionItems,
  ] = await Promise.all([
    db.product.count(),
    db.productPhoto.count(),
    db.cartItem.count(),
    db.inventoryItem.count(),
    db.wishlist.count(),
    db.orderItem.count(),
    db.collectionItem.count(),
  ]);
  return {
    products,
    photos,
    cartItems,
    inventoryItems,
    wishlists,
    orderItems,
    collectionItems,
  };
}

// 삭제 전 백업용 — 전체 상품·사진을 JSON 문자열로 반환 (클라이언트에서 파일 다운로드).
export async function exportProductsBackup(): Promise<{
  json: string;
  productCount: number;
  photoCount: number;
}> {
  await requireAdmin();
  const bigintReplacer = (_k: string, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v;

  const [products, photos] = await Promise.all([
    db.product.findMany(),
    db.productPhoto.findMany(),
  ]);
  return {
    json: JSON.stringify({ products, photos }, bigintReplacer, 2),
    productCount: products.length,
    photoCount: photos.length,
  };
}

export type PurgeResult = {
  products: number;
  photos: number;
  cartItems: number;
  wishlists: number;
};

// 전체 상품 삭제 — 상품과 일회성 데이터(사진·장바구니·위시리스트)만 제거.
// 구매 결과(order_item·inventory_item)와 컬렉션 등록은 보존한다.
// 주문/컬렉션 기록은 보존(고아 참조로 남을 수 있음). 확인 문구 불일치 시 거부.
export async function purgeAllProducts(confirm: string): Promise<PurgeResult> {
  await requireAdmin();
  if (confirm !== PURGE_CONFIRM_WORD) {
    throw new Error("확인 문구가 일치하지 않습니다.");
  }

  // inventory_item은 지우지 않는다 — 구매 결과 원장이고, 컬렉션 카드가 이 스냅샷
  // (product_name·thumbnail_key·수량)으로 그려진다. 지우면 컬렉션이 빈 채로 보인다.
  // GRANT에도 DELETE가 없다(order_item과 동일 계열 — 구매 결과는 보존).
  const result = await db.$transaction(async (tx) => {
    const cartItems = (await tx.cartItem.deleteMany({})).count;
    const wishlists = (await tx.wishlist.deleteMany({})).count;
    const photos = (await tx.productPhoto.deleteMany({})).count;
    const products = (await tx.product.deleteMany({})).count;
    return { products, photos, cartItems, wishlists };
  });

  revalidatePath("/admin/products");
  revalidatePath("/catalog/import");
  revalidatePath("/admin/settlement");
  revalidatePath("/");
  return result;
}

// 외부 카드 하나를 초안(draft) 상품으로 등록 — 재고 0·매입정보 미입력.
// 그룹·멤버는 find-or-create로 항상 매핑(없으면 자동 생성, refs 캐시 공유).
// 판매가는 외부 시세(엔)를 현재 환율로 환산해 500원 단위로 반영한다(rate100 = 100¥당 원).
async function importCardAsDraft(
  card: ExternalCard,
  refs: RefsCache,
  rate100: number,
): Promise<void> {
  const prefill = buildImportPrefill(card, refs.members, refs.teams);
  const { teamId, memberId } = await resolveImportRefs(card, refs);
  // 시리즈 find-or-create — 그룹→멤버→종류→시리즈 계층 자동 유지.
  const seriesId = await resolveSeriesId(card.series, teamId, refs);
  const sku = card.item_code || String(card.id);
  // 판매가 우선순위: 외부 지정 판매가 > 시세 평균 > 정가. 환율 적용 후 500원 단위.
  const priceJpy =
    card.sale_price_jpy || card.market_avg_jpy || card.retail_price_jpy || 0;
  const price = jpyToKrwPrice(priceJpy, rate100);
  // 매입가 — 외부에 기록돼 있으면 그대로 환산해 원가로 반영.
  const purchaseJpy = card.purchase_price_jpy || 0;
  const purchaseKrw =
    purchaseJpy > 0 ? Math.round((purchaseJpy * rate100) / 100) : 0;

  const photos = [
    {
      r2Key: await copyImageToR2(card.image_url, `${sku}-front.jpg`),
      isThumbnail: true,
      displayOrder: 0,
    },
  ];
  if (card.back_image_url) {
    photos.push({
      r2Key: await copyImageToR2(card.back_image_url, `${sku}-back.jpg`),
      isThumbnail: false,
      displayOrder: 1,
    });
  }

  await createProduct({
    itemCode: prefill.itemCode || null,
    sourceId: String(card.id),
    itemType: "photocard",
    saleMode: "fixed",
    teamId,
    memberId,
    seriesId,
    marketAvgJpy: card.market_avg_jpy || 0,
    marketMinJpy: card.market_min_jpy || 0,
    marketMaxJpy: card.market_max_jpy || 0,
    marketSoldCount: card.market_sold_count || 0,
    retailPriceJpy: card.retail_price_jpy || 0,
    name: prefill.name,
    description: prefill.description || null,
    purchasePriceJpy: purchaseJpy,
    purchaseExchangeRate: purchaseJpy > 0 ? rate100 / 100 : 1,
    purchasePriceKrw: purchaseKrw,
    packagingCostKrw: 0,
    overseasShippingKrw: 0,
    domesticShippingKrw: 0,
    otherCostKrw: 0,
    purchaser: null,
    purchaseDate: todayKstYmd(),
    regularPrice: price,
    salePrice: price,
    condition: null,
    stockQuantity: 0,
    saleStatus: "draft",
    photos,
  });
}

export type BulkImportResult = {
  created: number;
  createdNames: string[];
  failed: { name: string; error: string }[];
  remaining: number; // 이번 배치 후 아직 남은 신규 후보 수 (진행도용)
  totalExternal: number;
};

// 외부 카탈로그에서 (그룹/멤버/종류 필터에 맞고) 아직 없는 카드를 한 배치(batchSize)만큼
// 초안 상품으로 등록한다. 중복은 외부 카드 고유 id(source_id)로 판별(멱등). 클라이언트가
// remaining이 0이 될 때까지 반복 호출하여 "전체 가져오기 + 진행도"를 구현한다(배치로 트래픽 분산).
export async function bulkImportAllCards(input: {
  teamId?: number | null;
  memberId?: number | null;
  kind?: string;
  batchSize?: number;
}): Promise<BulkImportResult> {
  await requireAdmin();
  const batchSize = Math.min(Math.max(input.batchSize ?? 8, 1), 30);
  const existing = new Set(await listImportedSourceIds());

  const [membersRaw, teamsRaw] = await Promise.all([listMembers(), listTeams()]);
  const members: MemberRef[] = membersRaw.map((m) => ({
    id: m.id,
    name: m.name,
    nameJa: (m.nameI18n?.["ja-jpan"] as string | undefined) ?? null,
  }));
  const teams: TeamRef[] = teamsRaw.map((t) => ({ id: t.id, name: t.name }));
  // find-or-create 캐시 — 배치 중 생성된 그룹·멤버·시리즈가 쌓여 중복 생성을 막는다.
  const seriesRows = await db.series.findMany({ select: { id: true, sku: true } });
  const refs: RefsCache = {
    teams,
    members,
    series: seriesRows.map((s) => ({ id: Number(s.id), sku: s.sku })),
  };

  // 외부 카탈로그 전체 수집 (kind는 API 필터, 그룹/멤버는 매핑 후 클라이언트 필터).
  const all: ExternalCard[] = [];
  let offset = 0;
  let total = 0;
  let pages = 0;
  while (pages < 40) {
    const res = await fetchExternalCards({
      kind: input.kind || undefined,
      limit: 100,
      offset,
    });
    total = res.total;
    if (res.items.length === 0) break;
    all.push(...res.items);
    offset += res.items.length;
    pages += 1;
    if (offset >= total) break;
  }

  // 후보 = 필터 통과 + 아직 미등록. 판별 키는 외부 카드 고유 id(source_id).
  // 같은 배치에 같은 id가 겹쳐 들어오는 것도 seen으로 차단.
  const seen = new Set<string>();
  const candidates = all.filter((card) => {
    const key = String(card.id);
    if (existing.has(key) || seen.has(key)) return false;
    const prefill = buildImportPrefill(card, members, teams);
    if (input.teamId != null && prefill.teamId !== input.teamId) return false;
    if (input.memberId != null && prefill.memberId !== input.memberId) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const createdNames: string[] = [];
  // 현재 기준 환율(100¥당 원) — 한 번만 조회해 배치 전체에 적용. 실패 시 0(가격 미정).
  const rate100 = await fetchJpyKrwRate(todayKstYmd())
    .then((r) => r.rate)
    .catch(() => 0);

  const failed: { name: string; error: string }[] = [];
  for (const card of candidates.slice(0, batchSize)) {
    try {
      await importCardAsDraft(card, refs, rate100);
      createdNames.push(card.name);
    } catch (error) {
      failed.push({
        name: card.name,
        error: error instanceof Error ? error.message : "등록 실패",
      });
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog/import");
  revalidatePath("/admin/settlement");
  revalidatePath("/");

  return {
    created: createdNames.length,
    createdNames,
    failed,
    remaining: Math.max(0, candidates.length - createdNames.length),
    totalExternal: total,
  };
}

export type CatalogSyncResult = {
  cardsCreated: number;
  cardsUpdated: number;
  totalExternal: number;
  seriesCreated: number;
  productsUpdated: number;
};

// 카탈로그 동기화 — 외부 전체 카드를 훑어 (1) 없는 시리즈를 자동 생성하고
// (2) source_id가 연결된 기존 상품에 시리즈·시세·정가를 백필/갱신한다.
// 관리자 입력값 보호: 매입가는 0(미입력)일 때만 외부 값을 채우고, 판매가는 건드리지 않는다.
export async function syncCatalogFromExternal(): Promise<CatalogSyncResult> {
  await requireAdmin();

  const [{ items, total }, seriesRows, teamsRaw, membersRaw] = await Promise.all([
    (async () => {
      const all: ExternalCard[] = [];
      let offset = 0;
      let totalCount = 0;
      let pages = 0;
      while (pages < 40) {
        const res = await fetchExternalCards({ limit: 100, offset });
        totalCount = res.total;
        if (res.items.length === 0) break;
        all.push(...res.items);
        offset += res.items.length;
        pages += 1;
        if (offset >= totalCount) break;
      }
      return { items: all, total: totalCount };
    })(),
    db.series.findMany({ select: { id: true, sku: true } }),
    listTeams(),
    listMembers(),
  ]);

  const refs: RefsCache = {
    teams: teamsRaw.map((t) => ({ id: t.id, name: t.name })),
    members: membersRaw.map((m) => ({
      id: m.id,
      name: m.name,
      nameJa: (m.nameI18n?.["ja-jpan"] as string | undefined) ?? null,
    })),
    series: seriesRows.map((s) => ({ id: Number(s.id), sku: s.sku })),
  };
  const seriesBefore = refs.series.length;

  // 현재 환율 — 매입가 백필용(실패 시 0 → 매입가 백필 생략).
  const rate100 = await fetchJpyKrwRate(todayKstYmd())
    .then((r) => r.rate)
    .catch(() => 0);

  // source_id → 우리 상품(복수 매물 가능) 매핑.
  const products = await db.product.findMany({
    where: { sourceId: { not: null } },
    select: { id: true, sourceId: true, purchasePriceJpy: true },
  });
  const bySource = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.sourceId as string;
    const arr = bySource.get(key) ?? [];
    arr.push(p);
    bySource.set(key, arr);
  }

  // 토레카 마스터(card) upsert 준비 — external_id 매핑.
  const cardRows = await db.card.findMany({
    where: { externalId: { not: null } },
    select: { id: true, externalId: true },
  });
  const cardByExternal = new Map(
    cardRows.map((r) => [Number(r.externalId), r.id]),
  );
  // 포즈 부여용 — (멤버, 시리즈)별 현재 최대 포즈를 배치 내에서 캐시.
  const poseMax = new Map<string, number>();
  const poseRows = await db.card.groupBy({
    by: ["memberId", "seriesId"],
    _max: { pose: true },
  });
  for (const r of poseRows) {
    poseMax.set(`${r.memberId ?? 0}:${r.seriesId ?? 0}`, r._max.pose ?? 0);
  }
  let cardsCreated = 0;
  let cardsUpdated = 0;

  let productsUpdated = 0;
  for (const card of items) {
    // 팀은 시리즈 생성에만 필요 — 카드의 팀이 우리 DB에 없으면 만들어 계층을 유지.
    const { teamId, memberId } = await resolveImportRefs(card, refs);
    const seriesId = await resolveSeriesId(card.series, teamId, refs);

    // 토레카 마스터 upsert — 자체 카드 DB. 외부 이미지는 URL 참조로 두고,
    // 자체 업로드(R2)가 이미 있으면 덮어쓰지 않는다.
    const cardData = {
      itemCode: card.item_code || null,
      itemType: card.item_type || "photocard",
      teamId: BigInt(teamId),
      memberId: BigInt(memberId),
      seriesId: seriesId !== null ? BigInt(seriesId) : null,
      name: card.name,
      description: card.description,
      frontImageUrl: card.image_url || null,
      backImageUrl: card.back_image_url,
      marketAvgJpy: card.market_avg_jpy || 0,
      marketMinJpy: card.market_min_jpy || 0,
      marketMaxJpy: card.market_max_jpy || 0,
      marketSoldCount: card.market_sold_count || 0,
      retailPriceJpy: card.retail_price_jpy || 0,
      updatedAt: new Date(),
    };
    const existingCardId = cardByExternal.get(card.id);
    if (existingCardId !== undefined) {
      await db.card.update({ where: { id: existingCardId }, data: cardData });
      cardsUpdated += 1;
    } else {
      const poseKey = `${cardData.memberId}:${cardData.seriesId ?? 0}`;
      const pose = (poseMax.get(poseKey) ?? 0) + 1;
      poseMax.set(poseKey, pose);
      const created = await db.card.create({
        data: {
          source: "external",
          status: "active",
          externalId: BigInt(card.id),
          pose,
          ...cardData,
        },
      });
      cardByExternal.set(card.id, created.id);
      cardsCreated += 1;
    }

    const rows = bySource.get(String(card.id)) ?? [];
    for (const row of rows) {
      const purchaseJpy = card.purchase_price_jpy || 0;
      const backfillPurchase =
        row.purchasePriceJpy === 0 && purchaseJpy > 0 && rate100 > 0;
      await db.product.update({
        where: { id: row.id },
        data: {
          seriesId: seriesId !== null ? BigInt(seriesId) : null,
          marketAvgJpy: card.market_avg_jpy || 0,
          marketMinJpy: card.market_min_jpy || 0,
          marketMaxJpy: card.market_max_jpy || 0,
          marketSoldCount: card.market_sold_count || 0,
          retailPriceJpy: card.retail_price_jpy || 0,
          ...(backfillPurchase
            ? {
                purchasePriceJpy: purchaseJpy,
                purchaseExchangeRate: rate100 / 100,
                purchasePriceKrw: Math.round((purchaseJpy * rate100) / 100),
              }
            : {}),
          updatedAt: new Date(),
        },
      });
      productsUpdated += 1;
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog/import");
  revalidatePath("/catalog/cards");
  revalidatePath("/");

  return {
    totalExternal: total,
    seriesCreated: refs.series.length - seriesBefore,
    cardsCreated,
    cardsUpdated,
    productsUpdated,
  };
}
