import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import { ProductCard } from "./ProductCard";
import type { ProductWithPhotos } from "../types";

type Props = {
  products: ProductWithPhotos[];
  teams: Team[];
  members: MemberWithTeams[];
  publicBaseUrl: string;
  searchQuery?: string;
  hasFilters: boolean;
  wishedIds?: Set<string>;
  /** 보는 사람 계정 id — 카드의 '내 낙찰' 구분용. */
  viewerAccountId?: string | null;
};

export function ProductGrid({
  products,
  teams,
  members,
  publicBaseUrl,
  searchQuery,
  hasFilters,
  wishedIds,
  viewerAccountId = null,
}: Props) {
  if (products.length === 0) {
    if (searchQuery || hasFilters) {
      return (
        <div className="rounded-md border border-border bg-card p-12 text-center shadow-card">
          <p className="mb-2 text-4xl">🔍</p>
          <p className="font-display text-foreground">
            {searchQuery
              ? `"${searchQuery}" 검색 결과가 없어요`
              : "조건에 맞는 상품이 없어요"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            다른 그룹·멤버로 찾아보세요
          </p>
          <Button asChild variant="secondary" className="mt-5">
            <Link href="/products">필터 초기화</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="rounded-md border border-border bg-card p-12 text-center shadow-card">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <p className="font-display text-foreground">상품 준비 중이에요</p>
        <p className="mt-1 text-sm text-muted-foreground">
          곧 예쁜 토레카로 채워질 거예요
        </p>
      </div>
    );
  }

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const memberById = new Map(members.map((member) => [member.id, member]));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          team={
            product.teamId !== null ? teamById.get(product.teamId) : undefined
          }
          member={
            product.memberId !== null
              ? memberById.get(product.memberId)
              : undefined
          }
          publicBaseUrl={publicBaseUrl}
          wished={wishedIds?.has(String(product.id)) ?? false}
          isLoggedIn={wishedIds !== undefined}
          viewerAccountId={viewerAccountId}
        />
      ))}
    </div>
  );
}

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="space-y-2.5">
          <Skeleton className="aspect-[3/4] w-full rounded-sm border border-border shadow-card" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
