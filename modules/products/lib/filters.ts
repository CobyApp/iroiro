import {
  ITEM_TYPES,
  PRODUCT_CONDITIONS,
  SALE_MODES,
  SALE_STATUSES,
  type ItemType,
  type ProductCondition,
  type SaleMode,
  type SaleStatus,
} from "../types";

export type ProductSort =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "stock_desc"
  | "updated_desc";

export type StockFilter = "in_stock" | "out_of_stock";

const VALID_STOCK_FILTERS: StockFilter[] = ["in_stock", "out_of_stock"];

// 컬럼 수(2/4/5)의 공통 배수 — 모든 화면에서 마지막 행이 깔끔하게 채워짐.
export const PRODUCT_PAGE_SIZE = 20;
// 어드민 목록은 표 형태라 한 줄당 row 1개 — 공개 그리드(4컬럼)보다 작게 잡음.
export const ADMIN_PRODUCT_PAGE_SIZE = 20;

export type ProductFilter = {
  q?: string;
  teamId?: number;
  memberId?: number;
  itemType?: ItemType;
  condition?: ProductCondition;
  /**
   * 재고 필터 — 3-state.
   * - `undefined`: 모든 재고 (필터 미적용)
   * - `"in_stock"`: stock_quantity > 0
   * - `"out_of_stock"`: stock_quantity = 0
   */
  stock?: StockFilter;
  /**
   * 판매 상태 필터.
   * - 공개 페이지(shop): 코드에서 `"active"`로 override해 URL 값 무시 (draft/archived 노출 방지).
   * - 어드민: URL `?status=...`를 그대로 반영해 필터링.
   */
  saleStatus?: SaleStatus;
  /** 판매 방식 필터 — URL `?mode=auction|fixed`. 미지정이면 전체. */
  saleMode?: SaleMode;
  /**
   * 진행중(live) 경매 제외 — URL 파라미터가 아니라 코드에서만 설정.
   * 둘러보기 기본 화면이 상단 '입찰 진행중' 행과 그리드를 분리할 때 사용.
   */
  excludeLiveAuctions?: boolean;
  /**
   * 구매 불가(품절·종료된 경매)를 목록 맨 뒤로 — 코드에서만 설정.
   * 공개 둘러보기·홈 큐레이션에서 사용(어드민 목록은 원래 정렬 유지).
   */
  deprioritizeUnavailable?: boolean;
  sort: ProductSort;
  page: number;
  pageSize: number;
};

const VALID_SORTS: ProductSort[] = [
  "newest",
  "price_asc",
  "price_desc",
  "stock_desc",
  "updated_desc",
];

function getOne(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function parseProductFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ProductFilter {
  const sortRaw = getOne(searchParams, "sort");
  const sort: ProductSort = VALID_SORTS.includes(sortRaw as ProductSort)
    ? (sortRaw as ProductSort)
    : "newest";

  const pageRaw = Number(getOne(searchParams, "page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const itemRaw = getOne(searchParams, "item");
  const itemType: ItemType | undefined =
    itemRaw && (ITEM_TYPES as readonly string[]).includes(itemRaw)
      ? (itemRaw as ItemType)
      : undefined;

  const statusRaw = getOne(searchParams, "status");
  const saleStatus: SaleStatus | undefined =
    statusRaw && (SALE_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as SaleStatus)
      : undefined;

  const conditionRaw = getOne(searchParams, "condition");
  const condition: ProductCondition | undefined =
    conditionRaw &&
    (PRODUCT_CONDITIONS as readonly string[]).includes(conditionRaw)
      ? (conditionRaw as ProductCondition)
      : undefined;

  const modeRaw = getOne(searchParams, "mode");
  const saleMode: SaleMode | undefined =
    modeRaw && (SALE_MODES as readonly string[]).includes(modeRaw)
      ? (modeRaw as SaleMode)
      : undefined;

  const stockRaw = getOne(searchParams, "stock");
  const stock: StockFilter | undefined =
    stockRaw && (VALID_STOCK_FILTERS as readonly string[]).includes(stockRaw)
      ? (stockRaw as StockFilter)
      : undefined;

  return {
    q: getOne(searchParams, "q") || undefined,
    teamId: parsePositiveInt(getOne(searchParams, "team")),
    memberId: parsePositiveInt(getOne(searchParams, "member")),
    itemType,
    condition,
    saleStatus,
    saleMode,
    stock,
    sort,
    page,
    pageSize: PRODUCT_PAGE_SIZE,
  };
}

export function buildProductQuery(filter: Partial<ProductFilter>): string {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.teamId !== undefined) params.set("team", String(filter.teamId));
  if (filter.memberId !== undefined)
    params.set("member", String(filter.memberId));
  if (filter.itemType) params.set("item", filter.itemType);
  if (filter.condition) params.set("condition", filter.condition);
  if (filter.saleStatus) params.set("status", filter.saleStatus);
  if (filter.saleMode) params.set("mode", filter.saleMode);
  if (filter.stock) params.set("stock", filter.stock);
  if (filter.sort && filter.sort !== "newest") params.set("sort", filter.sort);
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));

  const query = params.toString();
  return query ? `?${query}` : "";
}
