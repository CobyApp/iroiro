import "server-only";

import type {
  CatalogMemberRow as PrismaMember,
  CatalogTeamMemberRow as PrismaTeamMember,
} from "@/lib/catalog-db";
import type { NameI18n } from "@/lib/i18n";
import { formatKstDate } from "@/lib/datetime";
import { toTeamMember } from "@/modules/team-members/lib/transform";
import type { Member, MemberWithTeams } from "../types";

export function toMember(row: PrismaMember): Member {
  return {
    id: Number(row.id),
    name: row.name,
    nameI18n: (row.nameI18n as NameI18n | null) ?? null,
    debutDate: row.debutDate ? formatKstDate(row.debutDate) : null,
    retireDate: row.retireDate ? formatKstDate(row.retireDate) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function withTeams(
  member: Member,
  memberships: PrismaTeamMember[],
): MemberWithTeams {
  const ofMember = memberships.filter(
    (tm) => Number(tm.memberId) === member.id,
  );
  const teamIds = Array.from(new Set(ofMember.map((tm) => Number(tm.teamId))));
  const displayOrderByTeam: Record<number, number | null> = {};
  const roleByTeam: Record<number, string | null> = {};
  for (const tm of ofMember) {
    displayOrderByTeam[Number(tm.teamId)] = tm.displayOrder;
    roleByTeam[Number(tm.teamId)] = tm.role;
  }
  return {
    ...member,
    teamIds,
    displayOrderByTeam,
    roleByTeam,
    memberships: ofMember.map(toTeamMember),
  };
}
