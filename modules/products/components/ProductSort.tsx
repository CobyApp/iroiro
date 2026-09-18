"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildProductQuery,
  type ProductFilter,
  type ProductSort as ProductSortType,
} from "../lib/filters";

const SORT_LABEL: Record<ProductSortType, string> = {
  newest: "신상순",
  price_asc: "가격 낮은순",
  price_desc: "가격 높은순",
  stock_desc: "재고 많은순",
  updated_desc: "최근 수정순",
};

// 공개 페이지 기본 옵션 — "최근 수정순"은 어드민에서만 의미가 있어 제외.
const DEFAULT_SORT_OPTIONS: ProductSortType[] = [
  "newest",
  "price_asc",
  "price_desc",
  "stock_desc",
];

type Props = {
  filter: ProductFilter;
  basePath?: string;
  /** 노출할 정렬 옵션 화이트리스트 — 어드민은 `updated_desc` 포함해 5개 전달. */
  options?: ProductSortType[];
  /** 컨텍스트별 라벨 오버라이드 — 예: 어드민에서 "신상순"→"최근 등록순". */
  labels?: Partial<Record<ProductSortType, string>>;
  /** 트리거 스타일 오버라이드 — 모바일 필터 줄에 낄 때 칩 크기로 맞춘다. */
  triggerClassName?: string;
};

export function ProductSort({
  filter,
  basePath = "/",
  options = DEFAULT_SORT_OPTIONS,
  labels,
  triggerClassName,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const next: Partial<ProductFilter> = {
      q: filter.q,
      teamId: filter.teamId,
      memberId: filter.memberId,
      itemType: filter.itemType,
      condition: filter.condition,
      saleStatus: filter.saleStatus,
      saleMode: filter.saleMode,
      stock: filter.stock,
      sort: value as ProductSortType,
      page: 1,
      pageSize: filter.pageSize,
    };
    startTransition(() =>
      router.push(`${basePath}${buildProductQuery(next)}`),
    );
  }

  return (
    <Select value={filter.sort} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className={triggerClassName ?? "w-[140px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((sort) => (
          <SelectItem key={sort} value={sort}>
            {labels?.[sort] ?? SORT_LABEL[sort]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
