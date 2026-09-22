import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { FavoritesForm } from "@/modules/favorites/components/FavoritesForm";
import { getFavorites } from "@/modules/favorites/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";

export const metadata: Metadata = { title: "최애 설정" };

// 최애 설정 — 좋아하는 그룹·멤버(복수)를 저장하면 홈 추천에 반영된다.
export default async function FavoritesPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("profile"));

  const [teams, members, favorites] = await Promise.all([
    listTeams(),
    listMembers(),
    getFavorites(account.id),
  ]);

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        eyebrow="MY FAVE"
        title="최애 설정"
        description="좋아하는 그룹·멤버를 고르면 홈에서 오시 위주로 추천해 드려요."
      />
      <section className="shop-content-surface">
        <FavoritesForm
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            teamIds: m.teamIds,
            displayOrderByTeam: m.displayOrderByTeam,
          }))}
          initialTeamIds={favorites.teamIds}
          initialMemberIds={favorites.memberIds}
        />
      </section>
    </div>
  );
}
