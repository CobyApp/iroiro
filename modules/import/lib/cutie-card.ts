import "server-only";

import { env } from "@/lib/env";

// 외부 Cutie Card 분석기(card.taba.asia) v1 컬렉션 아이템 — 임포트에 쓰는 필드만.
export type ExternalCard = {
  id: number;
  item_code: string;
  item_type: string;
  team_id: string;
  member_id: string;
  name: string;
  description: string | null;
  market_avg_jpy: number;
  market_min_jpy: number;
  market_max_jpy: number;
  market_sold_count: number;
  purchase_price_jpy: number;
  sale_price_jpy: number;
  retail_price_jpy: number;
  source_url: string | null;
  product_url: string | null;
  image_url: string;
  back_image_url: string | null;
  member: {
    key: string;
    name_ko: string;
    name_ja: string;
    name_romaji: string;
    color: string;
  };
  series: { sku: string; kind: string; label: string; product_url: string | null };
};

function headers(): Record<string, string> {
  const key = env.CUTIE_CARD_API_KEY;
  if (!key) throw new Error("CUTIE_CARD_API_KEY가 설정되지 않았습니다.");
  return { "X-API-Key": key };
}

export type ExternalListResult = {
  total: number;
  limit: number;
  offset: number;
  items: ExternalCard[];
};

// 외부 컬렉션 목록 — 멤버/종류 필터, 페이징.
export async function fetchExternalCards(params: {
  member?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<ExternalListResult> {
  const q = new URLSearchParams();
  if (params.member) q.set("member", params.member);
  if (params.kind) q.set("kind", params.kind);
  q.set("limit", String(params.limit ?? 60));
  q.set("offset", String(params.offset ?? 0));

  const res = await fetch(
    `${env.CUTIE_CARD_API_BASE}/api/v1/collection?${q.toString()}`,
    { headers: headers(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`외부 API 오류 (${res.status})`);
  return (await res.json()) as ExternalListResult;
}

// 외부 카탈로그 전체 수집 (kind만 API 필터, 그룹/멤버는 매핑 후 앱에서 필터).
export async function fetchAllExternalCards(
  params: { kind?: string } = {},
): Promise<{ items: ExternalCard[]; total: number }> {
  const all: ExternalCard[] = [];
  let offset = 0;
  let total = 0;
  let pages = 0;
  while (pages < 40) {
    const res = await fetchExternalCards({
      kind: params.kind,
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
  return { items: all, total };
}

export async function fetchExternalCard(id: number): Promise<ExternalCard | null> {
  const res = await fetch(
    `${env.CUTIE_CARD_API_BASE}/api/v1/collection/${id}`,
    { headers: headers(), cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`외부 API 오류 (${res.status})`);
  return (await res.json()) as ExternalCard;
}

// 외부 이미지 바이트 다운로드 (R2 복사용).
export async function fetchExternalImage(
  url: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType };
}
