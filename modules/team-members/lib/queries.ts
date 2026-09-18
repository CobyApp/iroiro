import "server-only";

import { db } from "@/lib/db";
import { toTeamMember } from "./transform";
import type { TeamMember } from "../types";

export async function listTeamMembers(filter?: {
  teamId?: number;
  memberId?: number;
  activeOnly?: boolean;
}): Promise<TeamMember[]> {
  const rows = await db.teamMember.findMany({
    where: {
      ...(filter?.teamId !== undefined && { teamId: BigInt(filter.teamId) }),
      ...(filter?.memberId !== undefined && {
        memberId: BigInt(filter.memberId),
      }),
      ...(filter?.activeOnly && { activeEndDate: null }),
    },
  });
  return rows.map(toTeamMember);
}
