"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDot,
  Gavel,
  Package,
  PackageX,
  SlidersHorizontal,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import { buildProductQuery, type ProductFilter } from "../lib/filters";
import {
  pickSaleModesWithListings,
  pickWithListings,
  type ListingFacets,
} from "../lib/facets";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABEL,
  PRODUCT_CONDITION_LABEL,
  SALE_MODES,
  SALE_STATUSES,
  SALE_STATUS_LABEL,
  type ItemType,
  type SaleMode,
  type SaleStatus,
} from "../types";

// 쇼핑 문맥 라벨 — 도메인 라벨("고정가")보다 구매자에게 익숙한 표현을 쓴다.
const SALE_MODE_FILTER_LABEL: Record<SaleMode, string> = {
  auction: "입찰 경매",
  fixed: "일반 판매",
};

type Props = {
  filter: ProductFilter;
  teams: Team[];
  members: MemberWithTeams[];
  /** 라우팅 prefix — 공개 페이지는 "/", 어드민은 "/delivery/products". */
  basePath?: string;
  /** 판매 상태 필터 노출 — 어드민에서만 true (공개 페이지는 active 고정). */
  showSaleStatus?: boolean;
  /** 재고없음 토글 노출 — 어드민에서만 true (공개 사용자에겐 의미 적음). */
  showOutOfStockFilter?: boolean;
  /**
   * 노출 중인 매물 facet — 넘기면 매물이 있는 그룹·멤버·판매방식만 칩/옵션으로 보인다
   * (고객 화면). 생략하면 카탈로그 마스터 전체를 보여준다(어드민).
   * 현재 선택된 값은 매물이 0이어도 남겨서 해제할 수 있게 한다.
   */
  facets?: ListingFacets;
};

export function ProductFilters({
  filter,
  teams,
  members,
  basePath = "/",
  showSaleStatus = false,
  showOutOfStockFilter = false,
  facets,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(patch: Partial<ProductFilter>) {
    const next: Partial<ProductFilter> = {
      q: filter.q,
      teamId: filter.teamId,
      memberId: filter.memberId,
      itemType: filter.itemType,
      condition: filter.condition,
      saleStatus: filter.saleStatus,
      saleMode: filter.saleMode,
      stock: filter.stock,
      sort: filter.sort,
      page: 1,
      pageSize: filter.pageSize,
      ...patch,
    };

    // 그룹이 바뀌면(해제 포함) 멤버 선택도 함께 초기화 — "모든 그룹"으로
    // 되돌릴 때 이전 멤버 필터가 stale하게 남는 문제 방지.
    if ("teamId" in patch && patch.teamId !== filter.teamId) {
      next.memberId = undefined;
    }

    startTransition(() => router.push(`${basePath}${buildProductQuery(next)}`));
  }

  // facets 가 있으면 매물이 있는 값만 — 빈 결과로 이어지는 태그를 고객에게 보이지 않는다.
  const visibleTeams = facets
    ? pickWithListings(teams, facets.teams, filter.teamId)
    : teams;
  const teamMembers =
    filter.teamId !== undefined
      ? members.filter((member) => member.teamIds.includes(filter.teamId!))
      : [];
  const filteredMembers =
    facets && filter.teamId !== undefined
      ? pickWithListings(
          teamMembers,
          facets.membersByTeam[String(filter.teamId)],
          filter.memberId,
        )
      : teamMembers;
  const visibleSaleModes = facets
    ? pickSaleModesWithListings(SALE_MODES, facets.saleModes, filter.saleMode)
    : [...SALE_MODES];
  const showInStockToggle =
    !facets || facets.inStock > 0 || filter.stock === "in_stock";

  const activeFilterCount =
    (filter.teamId !== undefined ? 1 : 0) +
    (filter.memberId !== undefined ? 1 : 0) +
    (filter.itemType ? 1 : 0) +
    (filter.condition ? 1 : 0) +
    (filter.saleStatus ? 1 : 0) +
    (filter.saleMode ? 1 : 0) +
    (filter.stock ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  function resetAll() {
    update({
      teamId: undefined,
      memberId: undefined,
      itemType: undefined,
      condition: undefined,
      saleStatus: undefined,
      saleMode: undefined,
      stock: undefined,
    });
  }

  const teamActive = filter.teamId !== undefined;
  const memberActive = filter.memberId !== undefined;
  const itemTypeActive = filter.itemType !== undefined;
  const saleStatusActive = filter.saleStatus !== undefined;
  const saleModeActive = filter.saleMode !== undefined;
  // 검색 활성 시 그룹·멤버 드롭다운은 숨김 — 검색이 이미 그룹·멤버 이름까지
  // 가로질러 매칭하므로 추가 필터 노출이 노이즈가 됨.
  const isSearching = Boolean(filter.q);
  const pillTriggerClass = "h-9 gap-2 rounded-full px-4 pr-3";
  const pillActiveClass =
    "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10";

  const controls = (
    <div className="flex flex-wrap gap-2">
      {!isSearching && visibleTeams.length > 0 && (
        <Select
          value={
            filter.teamId !== undefined ? String(filter.teamId) : "__all__"
          }
          onValueChange={(value) =>
            update({ teamId: value === "__all__" ? undefined : Number(value) })
          }
          disabled={pending}
        >
          <SelectTrigger
            className={cn(
              pillTriggerClass,
              "w-auto min-w-[140px] max-w-[240px]",
              teamActive && pillActiveClass,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="그룹" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">모든 그룹</SelectItem>
            {visibleTeams.map((team) => (
              <SelectItem key={team.id} value={String(team.id)}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!isSearching && (
        <Select
          value={
            filter.memberId !== undefined ? String(filter.memberId) : "__all__"
          }
          onValueChange={(value) =>
            update({
              memberId: value === "__all__" ? undefined : Number(value),
            })
          }
          disabled={filter.teamId === undefined || pending}
        >
          <SelectTrigger
            className={cn(
              pillTriggerClass,
              "w-auto min-w-[140px] max-w-[240px]",
              memberActive && pillActiveClass,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <User className="h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="멤버" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">모든 멤버</SelectItem>
            {filteredMembers.map((member) => (
              <SelectItem key={member.id} value={String(member.id)}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {ITEM_TYPES.length > 1 && (
        <Select
          value={filter.itemType ?? "__all__"}
          onValueChange={(value) =>
            update({
              itemType: value === "__all__" ? undefined : (value as ItemType),
            })
          }
          disabled={pending}
        >
          <SelectTrigger
            className={cn(
              pillTriggerClass,
              "w-auto min-w-[140px] max-w-[240px]",
              itemTypeActive && pillActiveClass,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Tag className="h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="아이템" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">모든 아이템</SelectItem>
            {ITEM_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {ITEM_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {visibleSaleModes.length > 0 && (
        <Select
          value={filter.saleMode ?? "__all__"}
          onValueChange={(value) =>
            update({
              saleMode: value === "__all__" ? undefined : (value as SaleMode),
            })
          }
          disabled={pending}
        >
          <SelectTrigger
            className={cn(
              pillTriggerClass,
              "w-auto min-w-[140px] max-w-[240px]",
              saleModeActive && pillActiveClass,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Gavel className="h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="판매 방식" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">모든 판매 방식</SelectItem>
            {visibleSaleModes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {SALE_MODE_FILTER_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 상품 상태 필터 없음 — 스토어 판매품은 상태 미노출 정책.
         URL로 남은 condition은 아래 활성 칩에서 해제만 가능. */}
      {showSaleStatus && (
        <Select
          value={filter.saleStatus ?? "__all__"}
          onValueChange={(value) =>
            update({
              saleStatus:
                value === "__all__" ? undefined : (value as SaleStatus),
            })
          }
          disabled={pending}
        >
          <SelectTrigger
            className={cn(
              pillTriggerClass,
              "w-auto min-w-[140px] max-w-[240px]",
              saleStatusActive && pillActiveClass,
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <CircleDot className="h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="판매 상태" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">모든 상태</SelectItem>
            {SALE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {SALE_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showInStockToggle && (
        <Button
          type="button"
          variant={filter.stock === "in_stock" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            update({
              stock: filter.stock === "in_stock" ? undefined : "in_stock",
            })
          }
          disabled={pending}
          className="h-9 gap-2 rounded-full px-4"
        >
          <Package className="h-4 w-4" />
          재고있음
        </Button>
      )}
      {showOutOfStockFilter && (
        <Button
          type="button"
          variant={filter.stock === "out_of_stock" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            update({
              stock:
                filter.stock === "out_of_stock" ? undefined : "out_of_stock",
            })
          }
          disabled={pending}
          className="h-9 gap-2 rounded-full px-4"
        >
          <PackageX className="h-4 w-4" />
          재고없음
        </Button>
      )}

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetAll}
          disabled={pending}
          className="h-9 rounded-full text-muted-foreground hover:text-foreground"
        >
          초기화
        </Button>
      )}
    </div>
  );

  // 지금 적용된 조건을 명시적으로 보여주는 칩 — 하나씩 바로 해제할 수 있다.
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filter.teamId !== undefined) {
    activeChips.push({
      key: "team",
      label: teams.find((t) => t.id === filter.teamId)?.name ?? "그룹",
      onRemove: () => update({ teamId: undefined }),
    });
  }
  if (filter.memberId !== undefined) {
    activeChips.push({
      key: "member",
      label: members.find((m) => m.id === filter.memberId)?.name ?? "멤버",
      onRemove: () => update({ memberId: undefined }),
    });
  }
  if (filter.itemType) {
    activeChips.push({
      key: "itemType",
      label: ITEM_TYPE_LABEL[filter.itemType],
      onRemove: () => update({ itemType: undefined }),
    });
  }
  if (filter.condition) {
    activeChips.push({
      key: "condition",
      label: PRODUCT_CONDITION_LABEL[filter.condition],
      onRemove: () => update({ condition: undefined }),
    });
  }
  if (filter.saleStatus) {
    activeChips.push({
      key: "saleStatus",
      label: SALE_STATUS_LABEL[filter.saleStatus],
      onRemove: () => update({ saleStatus: undefined }),
    });
  }
  if (filter.saleMode) {
    activeChips.push({
      key: "saleMode",
      label: SALE_MODE_FILTER_LABEL[filter.saleMode],
      onRemove: () => update({ saleMode: undefined }),
    });
  }
  if (filter.stock) {
    activeChips.push({
      key: "stock",
      label: filter.stock === "in_stock" ? "재고있음" : "재고없음",
      onRemove: () => update({ stock: undefined }),
    });
  }

  const activeChipsRow = activeChips.length > 0 && (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="적용된 필터">
      {activeChips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/8 py-1 pl-3 pr-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden />
          <span className="sr-only">{chip.label} 필터 해제</span>
        </button>
      ))}
      <button
        type="button"
        onClick={resetAll}
        disabled={pending}
        className="px-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
      >
        모두 지우기
      </button>
    </div>
  );

  // 모바일에선 그룹·멤버가 퀵칩의 선택 상태로, 재고·판매방식은 토글 칩으로 이미 보인다.
  // URL 등으로 걸린 나머지 조건(아이템·상품상태)만 작은 해제 칩으로 보여준다.
  const extraMobileChips = activeChips.filter(
    (chip) => !["team", "member", "stock", "saleMode"].includes(chip.key),
  );
  // 판매상태·재고없음 같은 관리자 전용 필터가 있는 화면만 모바일 시트를 유지한다.
  // 공개 페이지는 퀵칩 + 재고 토글로 충분해 '필터' 버튼을 없앤다.
  const useMobileSheet = showSaleStatus || showOutOfStockFilter;

  return (
    // min-w-0: flex 부모(정렬 셀렉트와 한 줄) 안에서 줄어들 수 있어야
    // 내부 가로 스크롤 행이 화면 폭을 밀어내지 않는다.
    <div className="min-w-0 max-w-full flex-1">
      <div className="hidden sm:block">
        {controls}
        {activeChipsRow}
      </div>
      {/* 모바일: 그룹은 가로 스크롤 칩으로 빠르게 훑고, 나머지 필터는 시트에 모은다.
         (상태·아이템 등은 시트 안에서만 노출해 상단이 여러 줄로 터지지 않게 한다.) */}
      <div className="sm:hidden">
        {!isSearching && visibleTeams.length > 0 && (
          <div
            className="scroll-x scroll-x-bleed mb-2 flex gap-2 overflow-x-auto pb-1"
            aria-label="그룹 카테고리"
          >
            <Button
              type="button"
              variant={filter.teamId === undefined ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => update({ teamId: undefined })}
              disabled={pending}
            >
              전체
            </Button>
            {visibleTeams.map((team) => (
              <Button
                key={team.id}
                type="button"
                variant={filter.teamId === team.id ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => update({ teamId: team.id })}
                disabled={pending}
              >
                {team.name}
              </Button>
            ))}
          </div>
        )}
        {/* 그룹을 고르면 그 멤버들을 바로 칩으로 — 포카 쇼핑의 핵심 필터라 시트에 숨기지 않는다. */}
        {!isSearching && filter.teamId !== undefined && filteredMembers.length > 0 && (
          <div
            className="scroll-x scroll-x-bleed mb-2 flex gap-2 overflow-x-auto pb-1"
            aria-label="멤버 필터"
          >
            <Button
              type="button"
              variant={filter.memberId === undefined ? "secondary" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => update({ memberId: undefined })}
              disabled={pending}
            >
              모든 멤버
            </Button>
            {filteredMembers.map((member) => (
              <Button
                key={member.id}
                type="button"
                variant={filter.memberId === member.id ? "secondary" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => update({ memberId: member.id })}
                disabled={pending}
              >
                {member.name}
              </Button>
            ))}
          </div>
        )}
        {/* 재고·판매방식 토글 한 줄 — 정렬은 결과 수 줄에 있다(필터와 성격 분리). */}
        <div className="scroll-x scroll-x-bleed flex items-center gap-1.5 overflow-x-auto pb-1">
          {useMobileSheet ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant={hasActiveFilters ? "default" : "outline"}
                  size="sm"
                  className="shrink-0 gap-2 rounded-full"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  필터{activeFilterCount > 0 && ` ${activeFilterCount}`}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[80vh]">
                <SheetHeader>
                  <SheetTitle>필터</SheetTitle>
                  <SheetDescription>
                    원하는 조건을 선택해 상품을 빠르게 찾아보세요.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4">{controls}</div>
              </SheetContent>
            </Sheet>
          ) : (
            showInStockToggle && (
              <Button
                type="button"
                variant={filter.stock === "in_stock" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  update({
                    stock: filter.stock === "in_stock" ? undefined : "in_stock",
                  })
                }
                disabled={pending}
                className="shrink-0 gap-1.5 rounded-full"
              >
                <Package className="h-4 w-4" />
                재고있음
              </Button>
            )
          )}
          {visibleSaleModes.map((mode) => (
            <Button
              key={mode}
              type="button"
              variant={filter.saleMode === mode ? "default" : "outline"}
              size="sm"
              onClick={() =>
                update({
                  saleMode: filter.saleMode === mode ? undefined : mode,
                })
              }
              disabled={pending}
              className="shrink-0 gap-1.5 rounded-full"
            >
              {mode === "auction" ? (
                <Gavel className="h-4 w-4" />
              ) : (
                <Tag className="h-4 w-4" />
              )}
              {SALE_MODE_FILTER_LABEL[mode]}
            </Button>
          ))}
          {extraMobileChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/35 bg-primary/8 py-1 pl-3 pr-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden />
              <span className="sr-only">{chip.label} 필터 해제</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
