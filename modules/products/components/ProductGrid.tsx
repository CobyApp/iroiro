import { Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
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
        <EmptyState
          emoji="🔍"
          title={
            searchQuery
              ? `"${searchQuery}" 검색 결과가 없어요`
              : "조건에 맞는 상품이 없어요"
          }
          description="다른 그룹·멤버로 찾아보세요"
          action={{ href: "/products", label: "필터 초기화", variant: "secondary" }}
        />
      );
    }

    return (
      <EmptyState
        icon={Sparkles}
        title="상품 준비 중이에요"
        description="곧 예쁜 토레카로 채워질 거예요"
      />
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
