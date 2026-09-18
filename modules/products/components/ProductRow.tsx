import { HScroll } from "@/components/HScroll";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import { ProductCard } from "./ProductCard";
import type { ProductWithPhotos } from "../types";

// 홈 큐레이션 섹션용 가로 스크롤 상품 행.
export function ProductRow({
  products,
  teams,
  members,
  publicBaseUrl,
  wishedIds,
  viewerAccountId = null,
}: {
  products: ProductWithPhotos[];
  teams: Team[];
  members: MemberWithTeams[];
  publicBaseUrl: string;
  wishedIds?: Set<string>;
  /** 보는 사람 계정 id — 카드의 '내 낙찰' 구분용. */
  viewerAccountId?: string | null;
}) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">상품이 곧 채워질 거예요.</p>
    );
  }
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // 첫 카드와 마지막 카드 뒤 여백은 제목의 시작선에 맞추고, 중간은 화면 끝까지 스크롤한다.
  // scroll-x는 스크롤바만 숨기며 카드 양끝에는 페이드 효과를 두지 않는다.
  return (
    <HScroll className="scroll-x scroll-x-bleed mt-3 flex gap-3 overflow-x-auto pb-3 pt-3">
      {products.map((product) => (
        <div key={product.id} className="w-40 shrink-0 sm:w-48">
          <ProductCard
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
        </div>
      ))}
    </HScroll>
  );
}
