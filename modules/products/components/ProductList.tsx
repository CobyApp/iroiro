"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BulkEditBar } from "./BulkEditBar";
import { QuickEditPopover } from "./QuickEditPopover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import { cn } from "@/lib/utils";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  PRODUCT_CONDITION_BADGE_CLASS,
  PRODUCT_CONDITION_LABEL,
  AUCTION_STATUS_LABEL,
  SALE_STATUS_LABEL,
  type ProductWithPhotos,
  type SaleStatus,
} from "../types";

type Props = {
  products: ProductWithPhotos[];
  teams: Team[];
  members: MemberWithTeams[];
  publicBaseUrl: string;
  /** 페이지네이션 적용 시 현재 페이지의 첫 row index. 글로벌 #번호 매김에 사용. */
  startIndex?: number;
};

const SALE_STATUS_BADGE: Record<
  SaleStatus,
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  active: {
    variant: "default",
    className: "bg-emerald-600 hover:bg-emerald-600",
  },
  draft: { variant: "secondary" },
  archived: { variant: "outline" },
};

export function ProductList({
  products,
  teams,
  members,
  publicBaseUrl,
  startIndex = 0,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 현재 필터·페이지·정렬을 edit URL에 그대로 전달 → form에서 돌아올 때 복원에 사용.
  function navigateTo(id: number) {
    const qs = searchParams.toString();
    router.push(`/delivery/products/${id}/edit${qs ? `?${qs}` : ""}`);
  }

  const allSelected =
    products.length > 0 && products.every((p) => selected.has(p.id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (products.every((p) => next.has(p.id))) {
        products.forEach((p) => next.delete(p.id));
      } else {
        products.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  if (products.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-card p-12 text-center text-muted-foreground">
        등록된 상품이 없습니다.
      </div>
    );
  }

  // 데스크톱 테이블 / 모바일 카드가 공유하는 파생값.
  const enriched = products.map((product, index) => {
    const team =
      product.teamId !== null
        ? teams.find((item) => item.id === product.teamId)
        : undefined;
    const member =
      product.memberId !== null
        ? members.find((item) => item.id === product.memberId)
        : undefined;
    const thumbnail =
      product.photos.find((photo) => photo.isThumbnail) ?? product.photos[0];
    return {
      product,
      index,
      team,
      member,
      thumbnail,
      hasDiscount: product.salePrice < product.regularPrice,
      memberJa: member?.nameI18n?.["ja-jpan"] as string | undefined,
    };
  });

  function StatusBadges({ product }: { product: ProductWithPhotos }) {
    return (
      <>
        {ITEM_TYPES.length > 1 && (
          <Badge variant="outline" className="font-normal">
            {ITEM_TYPE_LABEL[product.itemType]}
          </Badge>
        )}
        {product.condition && (
          <Badge
            variant="outline"
            className={cn(
              "font-normal",
              PRODUCT_CONDITION_BADGE_CLASS[product.condition],
            )}
          >
            {PRODUCT_CONDITION_LABEL[product.condition]}
          </Badge>
        )}
        <Badge
          variant={SALE_STATUS_BADGE[product.saleStatus].variant}
          className={SALE_STATUS_BADGE[product.saleStatus].className}
        >
          {SALE_STATUS_LABEL[product.saleStatus]}
        </Badge>
        {product.saleMode === "auction" && product.auctionStatus && (
          <Badge className="font-normal">
            {AUCTION_STATUS_LABEL[product.auctionStatus]}
            {product.auctionCurrentPrice !== null &&
              ` ₩${product.auctionCurrentPrice.toLocaleString()}`}
          </Badge>
        )}
      </>
    );
  }

  return (
    <>
      {/* 데스크톱 — 표 */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer accent-primary align-middle"
                  aria-label="이 페이지 전체 선택"
                />
              </TableHead>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead className="w-20">사진</TableHead>
              <TableHead>그룹 / 멤버</TableHead>
              <TableHead>상품명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">가격</TableHead>
              <TableHead className="text-right">재고</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">빠른 수정</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enriched.map(
              ({ product, index, team, member, thumbnail, hasDiscount, memberJa }) => (
                <TableRow
                  key={product.id}
                  tabIndex={0}
                  role="link"
                  aria-label={`${product.name} 상품 수정`}
                  onClick={() => navigateTo(product.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigateTo(product.id);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                >
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggle(product.id)}
                      className="h-4 w-4 cursor-pointer accent-primary align-middle"
                      aria-label={`${product.name} 선택`}
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {startIndex + index + 1}
                  </TableCell>
                  <TableCell>
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${publicBaseUrl}/${thumbnail.r2Key}`}
                        alt={thumbnail.altText ?? product.name}
                        className="h-12 w-12 rounded-xs object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xs bg-muted" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {team?.name ?? "-"}
                      {member && (
                        <span className="ml-1 text-muted-foreground">
                          / {member.name}
                          {memberJa && ` (${memberJa})`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{product.name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadges product={product} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium">
                      ₩{product.salePrice.toLocaleString()}
                      {hasDiscount && (
                        <div className="text-xs font-normal text-muted-foreground line-through">
                          ₩{product.regularPrice.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {product.saleStatus === "active" &&
                    product.stockQuantity === 0 ? (
                      <Badge variant="destructive">재고 없음</Badge>
                    ) : (
                      <div className="font-medium">{product.stockQuantity}</div>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <QuickEditPopover product={product} />
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>

      {/* 모바일 — 카드 리스트 */}
      <div className="space-y-2 md:hidden">
        {enriched.map(
          ({ product, team, member, thumbnail, hasDiscount, memberJa }) => (
            <div
              key={product.id}
              role="link"
              tabIndex={0}
              aria-label={`${product.name} 상품 수정`}
              onClick={() => navigateTo(product.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigateTo(product.id);
                }
              }}
              className="flex cursor-pointer gap-3 rounded-md border border-border bg-card p-3 shadow-card transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div
                className="flex items-start pt-0.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected.has(product.id)}
                  onChange={() => toggle(product.id)}
                  className="h-4 w-4 cursor-pointer accent-primary"
                  aria-label={`${product.name} 선택`}
                />
              </div>
              <div
                className="order-last flex items-start"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <QuickEditPopover product={product} />
              </div>
              {thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${publicBaseUrl}/${thumbnail.r2Key}`}
                  alt={thumbnail.altText ?? product.name}
                  className="h-16 w-16 shrink-0 rounded-xs object-cover"
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-xs bg-muted" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-xs text-muted-foreground">
                  {team?.name ?? "-"}
                  {member && ` / ${member.name}${memberJa ? ` (${memberJa})` : ""}`}
                </p>
                <p className="line-clamp-2 font-medium leading-snug">
                  {product.name}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadges product={product} />
                  {product.saleStatus === "active" &&
                    product.stockQuantity === 0 && (
                      <Badge variant="destructive">재고 없음</Badge>
                    )}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-medium">
                    ₩{product.salePrice.toLocaleString()}
                  </span>
                  {hasDiscount && (
                    <span className="text-xs text-muted-foreground line-through">
                      ₩{product.regularPrice.toLocaleString()}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    · 재고 {product.stockQuantity}
                  </span>
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      {selected.size > 0 && (
        <BulkEditBar
          ids={[...selected]}
          onClear={() => setSelected(new Set())}
        />
      )}
    </>
  );
}
