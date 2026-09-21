import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listProducts } from "@/modules/products/lib/queries";
import { ProductRow } from "@/modules/products/components/ProductRow";
import type { ProductWithPhotos } from "@/modules/products/types";
import { getWishlistProductIds } from "@/modules/wishlist/lib/queries";
import { getFavorites } from "../lib/queries";

// 홈 최애 섹션 — 오시(그룹/멤버)마다 독립 섹션으로 상품 행을 보여주고,
// '전체 보기'는 그 오시로 필터링된 둘러보기로 간다.
// 비로그인 미노출, 로그인+최애 미설정이면 설정 유도 카드.

const MAX_FAVE_TEAMS = 3;
const MAX_FAVE_MEMBERS = 6;
const ROW_SIZE = 8;

export async function MyFaveSection() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const favorites = await getFavorites(account.id);
  const hasFavorites =
    favorites.teamIds.length > 0 || favorites.memberIds.length > 0;

  if (!hasFavorites) {
    return (
      <section data-page-section>
        <Link
          href="/mypage/favorites"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              최애를 등록해 보세요
            </span>
            <span className="block text-xs text-muted-foreground">
              좋아하는 그룹·멤버를 고르면 여기서 맞춤 추천해 드려요
            </span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
        </Link>
      </section>
    );
  }

  // 찜 상태를 함께 조회 — 빠뜨리면 카드 하트가 "비로그인"으로 동작한다.
  const [teams, members, wishedIds] = await Promise.all([
    listTeams(),
    listMembers(),
    getWishlistProductIds(account.id),
  ]);
  const faveTeams = teams
    .filter((t) => favorites.teamIds.includes(t.id))
    .slice(0, MAX_FAVE_TEAMS);
  const faveMembers = members
    .filter((m) => favorites.memberIds.includes(m.id))
    .slice(0, MAX_FAVE_MEMBERS);

  // 오시별 상품 행 — 그룹/멤버 각각 최신순으로 병렬 조회.
  const [teamRows, memberRows] = await Promise.all([
    Promise.all(
      faveTeams.map((team) =>
        listProducts({
          saleStatus: "active",
          teamId: team.id,
          sort: "newest",
          page: 1,
          pageSize: ROW_SIZE,
        }).then((r) => r.items),
      ),
    ),
    Promise.all(
      faveMembers.map((member) =>
        listProducts({
          saleStatus: "active",
          memberId: member.id,
          sort: "newest",
          page: 1,
          pageSize: ROW_SIZE,
        }).then((r) => r.items),
      ),
    ),
  ]);

  type FaveRow = {
    key: string;
    eyebrow: string;
    title: string;
    href: string;
    products: ProductWithPhotos[];
  };
  const rows: FaveRow[] = [
    ...faveTeams.map((team, i) => ({
      key: `t-${team.id}`,
      eyebrow: "MY FAVE GROUP",
      title: team.name,
      href: `/products?team=${team.id}`,
      products: teamRows[i],
    })),
    ...faveMembers.map((member, i) => ({
      key: `m-${member.id}`,
      // 그룹명을 함께 — 다중 그룹 멤버·비슷한 이름을 구분할 수 있게.
      eyebrow: `MY FAVE MEMBER${
        member.teamIds[0] !== undefined
          ? ` · ${teams.find((t) => t.id === member.teamIds[0])?.name ?? ""}`
          : ""
      }`,
      title: member.name,
      href:
        member.teamIds[0] !== undefined
          ? `/products?team=${member.teamIds[0]}&member=${member.id}`
          : "/products",
      products: memberRows[i],
    })),
  ].filter((row) => row.products.length > 0);

  if (rows.length === 0) {
    return (
      <section data-page-section>
        <p className="rounded-2xl border border-border bg-muted/40 px-4 py-5 text-center text-sm text-muted-foreground">
          최애의 상품이 아직 없어요 — 입고되면 홈에서 바로 보여드릴게요!
        </p>
      </section>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <section
          key={row.key}
          className="kawaii-products-section"
          data-page-section
        >
          <div className="kawaii-section-heading">
            <div>
              <span>{row.eyebrow}</span>
              <h2>{row.title}</h2>
            </div>
            {/* 이 오시로 필터링된 둘러보기로 이동 */}
            <Link href={row.href} className="kawaii-more-link">
              전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ProductRow
            products={row.products}
            teams={teams}
            members={members}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={wishedIds}
            viewerAccountId={account.id}
          />
        </section>
      ))}
    </>
  );
}
