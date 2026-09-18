import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
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
import { listProducts } from "@/modules/products/lib/queries";

const ADMIN_PRODUCTS_PATH = "/admin/products";

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
    <div className="space-y-4 p-4 sm:p-6">
      <Toaster />
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">상품 목록</h2>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="mr-0.5 h-4 w-4" />
            신규 등록
          </Link>
        </Button>
      </div>

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
    </div>
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

  const startIndex = (filter.page - 1) * filter.pageSize;

  return (
    <div className="space-y-4">
      <ProductList
        products={items}
        teams={teams}
        members={members}
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
