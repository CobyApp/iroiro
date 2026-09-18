"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { buildProductQuery, type ProductFilter } from "../lib/filters";

type Props = {
  filter: ProductFilter;
  total: number;
  basePath?: string;
};

function pagesAround(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const result: (number | "...")[] = [1];
  if (current > 3) result.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let page = start; page <= end; page += 1) result.push(page);

  if (current < totalPages - 2) result.push("...");
  result.push(totalPages);
  return result;
}

export function ProductPagination({ filter, total, basePath = "/" }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(page: number): string {
    // 필터 전체를 그대로 실어 페이지 이동 시 어떤 필터도 풀리지 않게 한다.
    // (필드를 골라 담으면 새 필터가 생길 때마다 여기서 빠져 버그가 재발한다)
    return `${basePath}${buildProductQuery({ ...filter, page })}`;
  }

  return (
    <>
      <Pagination className="mt-8 sm:hidden">
        <PaginationContent className="w-full flex-nowrap justify-center gap-3">
          {filter.page > 1 ? (
            <PaginationItem>
              <PaginationPrevious
                href={hrefFor(filter.page - 1)}
                className="h-9 w-9 shrink-0 px-0 [&>span]:sr-only"
              />
            </PaginationItem>
          ) : (
            <PaginationItem aria-hidden className="h-9 w-9 shrink-0" />
          )}
          <PaginationItem>
            <span
              aria-label={`현재 ${filter.page}페이지, 전체 ${totalPages}페이지`}
              className="inline-flex h-9 min-w-20 items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-3 text-sm font-semibold tabular-nums text-foreground"
            >
              {filter.page} / {totalPages}
            </span>
          </PaginationItem>
          {filter.page < totalPages ? (
            <PaginationItem>
              <PaginationNext
                href={hrefFor(filter.page + 1)}
                className="h-9 w-9 shrink-0 px-0 [&>span]:sr-only"
              />
            </PaginationItem>
          ) : (
            <PaginationItem aria-hidden className="h-9 w-9 shrink-0" />
          )}
        </PaginationContent>
      </Pagination>

      <Pagination className="mt-8 hidden sm:flex">
        <PaginationContent>
          {filter.page > 1 && (
            <PaginationItem>
              <PaginationPrevious href={hrefFor(filter.page - 1)} />
            </PaginationItem>
          )}
          {pagesAround(filter.page, totalPages).map((page, index) =>
            page === "..." ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <PaginationLink
                  href={hrefFor(page)}
                  isActive={page === filter.page}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          {filter.page < totalPages && (
            <PaginationItem>
              <PaginationNext href={hrefFor(filter.page + 1)} />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    </>
  );
}
