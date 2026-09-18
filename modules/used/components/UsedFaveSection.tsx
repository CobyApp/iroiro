import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getFavorites } from "@/modules/favorites/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listUsedListings } from "../lib/queries";
import { getUsedWishlistIds } from "../lib/wishlist";
import { UsedRow } from "./UsedRow";
import type { UsedListingWithPhotos } from "../types";

// 중고 홈 최애 섹션 — 홈 MyFaveSection과 같은 구성이되 유저 매물을 보여준다.
// 비로그인·최애 미설정·매물 없음이면 조용히 미노출(설정 유도는 홈이 담당).

const MAX_FAVE_TEAMS = 3;
const MAX_FAVE_MEMBERS = 6;
const ROW_SIZE = 8;

export async function UsedFaveSection() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const favorites = await getFavorites(account.id);
  if (favorites.teamIds.length === 0 && favorites.memberIds.length === 0) {
    return null;
  }

  const [teams, members, wishedIds] = await Promise.all([
    listTeams(),
    listMembers(),
    getUsedWishlistIds(account.id),
  ]);
  const faveTeams = teams
    .filter((t) => favorites.teamIds.includes(t.id))
    .slice(0, MAX_FAVE_TEAMS);
  const faveMembers = members
    .filter((m) => favorites.memberIds.includes(m.id))
    .slice(0, MAX_FAVE_MEMBERS);

  const [teamRows, memberRows] = await Promise.all([
    Promise.all(
      faveTeams.map((team) =>
        listUsedListings({ teamId: team.id, pageSize: ROW_SIZE }).then(
          (r) => r.items,
        ),
      ),
    ),
    Promise.all(
      faveMembers.map((member) =>
        listUsedListings({ memberId: member.id, pageSize: ROW_SIZE }).then(
          (r) => r.items,
        ),
      ),
    ),
  ]);

  type FaveRow = {
    key: string;
    eyebrow: string;
    title: string;
    href: string;
    listings: UsedListingWithPhotos[];
  };
  const rows: FaveRow[] = [
    ...faveTeams.map((team, i) => ({
      key: `t-${team.id}`,
      eyebrow: "MY FAVE GROUP",
      title: team.name,
      href: `/used?team=${team.id}`,
      listings: teamRows[i],
    })),
    ...faveMembers.map((member, i) => ({
      key: `m-${member.id}`,
      eyebrow: "MY FAVE MEMBER",
      title: member.name,
      href:
        member.teamIds[0] !== undefined
          ? `/used?team=${member.teamIds[0]}&member=${member.id}`
          : "/used",
      listings: memberRows[i],
    })),
  ].filter((row) => row.listings.length > 0);

  if (rows.length === 0) return null;

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
              <h2>♡ {row.title}</h2>
            </div>
            <Link href={row.href} className="kawaii-more-link">
              전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <UsedRow
            listings={row.listings}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={wishedIds}
            isLoggedIn
          />
        </section>
      ))}
    </>
  );
}
