import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductFilters } from "@/modules/products/components/ProductFilters";
import { ProductList } from "@/modules/products/components/ProductList";
import { ProductPagination } from "@/modules/products/components/ProductPagination";
import { ProductSort } from "@/modules/products/components/ProductSort";
import {
  ADMIN_PRODUCT_PAGE_SIZE,
  parseProductFilters,
} from "@/modules/products/lib/filters";
import { listProducts, posesByCatalogCard } from "@/modules/products/lib/queries";

const ADMIN_PRODUCTS_PATH = "/delivery/products";

export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = {
    ...parseProductFilters(params),
    pageSize: ADMIN_PRODUCT_PAGE_SIZE,
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="상품 목록"
        description="토레카 카탈로그에 카드가 추가되면 여기에 임시저장 상품으로 자동 등록돼요. 가격·재고를 채워 공개하세요."
      >
        <Button asChild variant="outline">
          <Link href="/delivery/products/duplicates">중복 정리</Link>
        </Button>
      </AdminPageHeader>

      <Suspense fallback={<div className="h-10" />}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <AdminProductFiltersWrapper filter={filter} />
          <ProductSort
            filter={filter}
            basePath={ADMIN_PRODUCTS_PATH}
            options={[
              "newest",
              "updated_desc",
              "price_asc",
              "price_desc",
              "stock_desc",
            ]}
            labels={{ newest: "최근 등록순" }}
          />
        </div>
      </Suspense>

      <Suspense
        key={JSON.stringify(filter)}
        fallback={<div className="h-40" />}
      >
        <AdminProductsView filter={filter} />
      </Suspense>
    </AdminPage>
  );
}

async function AdminProductFiltersWrapper({
  filter,
}: {
  filter: ReturnType<typeof parseProductFilters>;
}) {
  const [teams, members] = await Promise.all([listTeams(), listMembers()]);
  return (
    <ProductFilters
      filter={filter}
      teams={teams}
      members={members}
      basePath={ADMIN_PRODUCTS_PATH}
      showSaleStatus
      showOutOfStockFilter
    />
  );
}

async function AdminProductsView({
  filter,
}: {
  filter: ReturnType<typeof parseProductFilters>;
}) {
  // 어드민은 saleStatus 미필터 — draft/active/archived 모두 노출.
  const [{ items, total }, teams, members] = await Promise.all([
    listProducts(filter),
    listTeams(),
    listMembers(),
  ]);

  // 이 페이지 상품들의 출처 카드 포즈 번호(있으면) — 목록에 "포즈 N" 표시.
  const poses = await posesByCatalogCard(
    items.map((p) => p.catalogCardId).filter((id): id is number => id != null),
  );

  const startIndex = (filter.page - 1) * filter.pageSize;

  return (
    <div className="space-y-4">
      <ProductList
        products={items}
        teams={teams}
        members={members}
        poses={poses}
        publicBaseUrl={env.R2_PUBLIC_BASE}
        startIndex={startIndex}
      />
      <ProductPagination
        filter={filter}
        total={total}
        basePath={ADMIN_PRODUCTS_PATH}
      />
    </div>
  );
}
