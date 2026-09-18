import type { NameI18n } from "@/lib/i18n";
import type { TeamMember } from "@/modules/team-members/types";

export type Member = {
  id: number;
  name: string;
  nameI18n: NameI18n | null;
  debutDate: string | null;
  retireDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemberWithTeams = Member & {
  teamIds: number[];
  displayOrderByTeam: Record<number, number | null>;
  roleByTeam: Record<number, string | null>;
  memberships: TeamMember[];
};
