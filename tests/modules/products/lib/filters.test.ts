import { describe, expect, it } from "vitest";
import {
  buildProductQuery,
  parseProductFilters,
  PRODUCT_PAGE_SIZE,
} from "@/modules/products/lib/filters";

describe("parseProductFilters", () => {
  it("빈 searchParams → 기본값", () => {
    const result = parseProductFilters({});
    expect(result).toEqual({
      q: undefined,
      teamId: undefined,
      memberId: undefined,
      itemType: undefined,
      condition: undefined,
      saleStatus: undefined,
      stock: undefined,
      sort: "newest",
      page: 1,
      pageSize: PRODUCT_PAGE_SIZE,
    });
  });

  it("유효한 sort 값을 그대로 사용", () => {
    expect(parseProductFilters({ sort: "price_asc" }).sort).toBe("price_asc");
    expect(parseProductFilters({ sort: "price_desc" }).sort).toBe("price_desc");
    expect(parseProductFilters({ sort: "stock_desc" }).sort).toBe("stock_desc");
  });

  it("무효한 sort 값은 newest fallback", () => {
    expect(parseProductFilters({ sort: "invalid" }).sort).toBe("newest");
    expect(parseProductFilters({ sort: "" }).sort).toBe("newest");
  });

  it("page는 양의 정수만 허용; 0·음수·NaN은 1로 정규화", () => {
    expect(parseProductFilters({ page: "3" }).page).toBe(3);
    expect(parseProductFilters({ page: "0" }).page).toBe(1);
    expect(parseProductFilters({ page: "-2" }).page).toBe(1);
    expect(parseProductFilters({ page: "abc" }).page).toBe(1);
    expect(parseProductFilters({ page: "2.7" }).page).toBe(2);
  });

  it("itemType은 ITEM_TYPES 화이트리스트만 통과", () => {
    expect(parseProductFilters({ item: "photocard" }).itemType).toBe(
      "photocard",
    );
    expect(parseProductFilters({ item: "album" }).itemType).toBeUndefined();
    expect(parseProductFilters({ item: "unknown" }).itemType).toBeUndefined();
  });

  it("stock 화이트리스트만 통과", () => {
    expect(parseProductFilters({ stock: "in_stock" }).stock).toBe("in_stock");
    expect(parseProductFilters({ stock: "out_of_stock" }).stock).toBe(
      "out_of_stock",
    );
    expect(parseProductFilters({ stock: "invalid" }).stock).toBeUndefined();
    expect(parseProductFilters({}).stock).toBeUndefined();
  });

  it("condition은 상품 컨디션 화이트리스트만 통과", () => {
    expect(parseProductFilters({ condition: "new" }).condition).toBe("new");
    expect(parseProductFilters({ condition: "good" }).condition).toBe(
      "good",
    );
    expect(
      parseProductFilters({ condition: "unknown" }).condition,
    ).toBeUndefined();
  });

  it("mode는 판매 방식 화이트리스트만 통과", () => {
    expect(parseProductFilters({ mode: "auction" }).saleMode).toBe("auction");
    expect(parseProductFilters({ mode: "fixed" }).saleMode).toBe("fixed");
    expect(parseProductFilters({ mode: "invalid" }).saleMode).toBeUndefined();
    expect(parseProductFilters({}).saleMode).toBeUndefined();
  });

  it("q·team·member 키를 도메인 필드로 매핑 (양의 정수만)", () => {
    const result = parseProductFilters({
      q: "njz",
      team: "1",
      member: "2",
    });
    expect(result.q).toBe("njz");
    expect(result.teamId).toBe(1);
    expect(result.memberId).toBe(2);
  });

  it("team/member에 양의 정수가 아닌 값은 undefined", () => {
    expect(parseProductFilters({ team: "abc" }).teamId).toBeUndefined();
    expect(parseProductFilters({ team: "0" }).teamId).toBeUndefined();
    expect(parseProductFilters({ team: "-1" }).teamId).toBeUndefined();
    expect(parseProductFilters({ team: "1.5" }).teamId).toBeUndefined();
  });

  it("값이 배열이면 첫 항목만 사용", () => {
    expect(parseProductFilters({ q: ["first", "second"] }).q).toBe("first");
  });

  it("빈 문자열 q는 undefined로 정규화", () => {
    expect(parseProductFilters({ q: "" }).q).toBeUndefined();
  });
});

describe("buildProductQuery", () => {
  it("빈 filter → 빈 문자열", () => {
    expect(buildProductQuery({})).toBe("");
  });

  it("기본값에 해당하는 sort=newest는 query에 포함하지 않음", () => {
    expect(buildProductQuery({ sort: "newest" })).toBe("");
  });

  it("page=1은 query에 포함하지 않음", () => {
    expect(buildProductQuery({ page: 1 })).toBe("");
  });

  it("stock 필터가 query에 포함", () => {
    expect(buildProductQuery({ stock: "in_stock" })).toBe("?stock=in_stock");
    expect(buildProductQuery({ stock: "out_of_stock" })).toBe(
      "?stock=out_of_stock",
    );
    expect(buildProductQuery({ stock: undefined })).toBe("");
  });

  it("saleMode 필터가 mode 키로 query에 포함", () => {
    expect(buildProductQuery({ saleMode: "auction" })).toBe("?mode=auction");
    expect(buildProductQuery({ saleMode: "fixed" })).toBe("?mode=fixed");
    expect(buildProductQuery({ saleMode: undefined })).toBe("");
  });

  it("condition 필터가 query에 포함", () => {
    expect(buildProductQuery({ condition: "like_new" })).toBe(
      "?condition=like_new",
    );
  });

  it("여러 필터 조합", () => {
    const result = buildProductQuery({
      q: "njz",
      teamId: 1,
      itemType: "photocard",
      condition: "good",
      sort: "price_asc",
      page: 2,
    });
    expect(result.startsWith("?")).toBe(true);
    const params = new URLSearchParams(result.slice(1));
    expect(params.get("q")).toBe("njz");
    expect(params.get("team")).toBe("1");
    expect(params.get("item")).toBe("photocard");
    expect(params.get("condition")).toBe("good");
    expect(params.get("sort")).toBe("price_asc");
    expect(params.get("page")).toBe("2");
  });

  it("특수문자는 URL 인코딩", () => {
    const result = buildProductQuery({ q: "한글 검색" });
    expect(result).toContain("q=");
    const params = new URLSearchParams(result.slice(1));
    expect(params.get("q")).toBe("한글 검색");
  });
});

// 회귀: 페이지 이동 시 판매방식 필터가 유지돼야 한다 — 파서·빌더 왕복 검증.
// (ProductPagination이 filter 전체를 스프레드로 싣는 전제를 이 왕복이 뒷받침)
describe("saleMode 왕복", () => {
  it("mode 파라미터를 파싱하고 쿼리로 되살린다", async () => {
    const { buildProductQuery, parseProductFilters } = await import(
      "@/modules/products/lib/filters"
    );
    const filter = parseProductFilters({ mode: "auction" });
    expect(filter.saleMode).toBe("auction");

    const query = buildProductQuery({ ...filter, page: 2 });
    expect(query).toContain("mode=auction");
    expect(query).toContain("page=2");
  });
});
