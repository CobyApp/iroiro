import "server-only";

import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";

// 시리즈 목록 — 카탈로그 시리즈 화면·홈이 쓴다. label 은 원본 표기(대개 일본어),
// labelKo 는 한국어 병기(label_i18n.ko). 카드·상품 연결 수를 함께 실어 삭제 가능 여부를 UI가 안다.

export type SeriesRow = {
  id: number;
  sku: string;
  label: string;
  labelKo: string | null;
  kind: string;
  teamId: number | null;
  /** 공식 상품 페이지 URL — 없으면 null. */
  productUrl: string | null;
  cardCount: number;
  productCount: number;
};

function koLabelOf(labelI18n: unknown): string | null {
  if (!labelI18n || typeof labelI18n !== "object") return null;
  const ko = (labelI18n as Record<string, unknown>).ko;
  return typeof ko === "string" && ko.trim() ? ko : null;
}

export async function listSeriesWithCounts(): Promise<SeriesRow[]> {
  const [rows, cardRows, productRows] = await Promise.all([
    catalogDb.series.findMany({ orderBy: [{ kind: "asc" }, { label: "asc" }] }),
    catalogDb.card.groupBy({
      by: ["seriesId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    db.product.groupBy({ by: ["seriesId"], _count: { _all: true } }),
  ]);
  const cards = new Map(
    cardRows
      .filter((r) => r.seriesId !== null)
      .map((r) => [Number(r.seriesId), r._count._all]),
  );
  const products = new Map(
    productRows
      .filter((r) => r.seriesId !== null)
      .map((r) => [Number(r.seriesId), r._count._all]),
  );
  return rows.map((s) => {
    const id = Number(s.id);
    return {
      id,
      sku: s.sku,
      label: s.label,
      labelKo: koLabelOf(s.labelI18n),
      kind: s.kind,
      teamId: s.teamId === null ? null : Number(s.teamId),
      productUrl: s.productUrl ?? null,
      cardCount: cards.get(id) ?? 0,
      productCount: products.get(id) ?? 0,
    };
  });
}

// 카드 등록 폼·표의 시리즈 선택지 — 한국어 병기가 있으면 「원문 (한국어)」로 보이게 라벨을 합친다.
export function seriesDisplayLabel(s: Pick<SeriesRow, "label" | "labelKo">): string {
  return s.labelKo && s.labelKo !== s.label ? `${s.label} (${s.labelKo})` : s.label;
}

export type SeriesOption = {
  id: number;
  teamId: number | null;
  label: string;
  kind: string;
  sku: string;
};

// 카드 화면 선택지 — 카운트 없이 가볍게. 라벨은 한국어 병기 포함, SKU 는 카드 상세 표시용.
export async function listSeriesOptions(): Promise<SeriesOption[]> {
  const rows = await catalogDb.series.findMany({
    select: { id: true, teamId: true, label: true, labelI18n: true, kind: true, sku: true },
    orderBy: { label: "asc" },
  });
  return rows.map((s) => ({
    id: Number(s.id),
    teamId: s.teamId === null ? null : Number(s.teamId),
    label: seriesDisplayLabel({ label: s.label, labelKo: koLabelOf(s.labelI18n) }),
    kind: s.kind,
    sku: s.sku,
  }));
}
