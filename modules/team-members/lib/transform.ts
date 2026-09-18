import "server-only";

import type { TeamMember as PrismaTeamMember } from "@prisma/client";
import { formatKstDate } from "@/lib/datetime";
import type { TeamMember } from "../types";

export function toTeamMember(row: PrismaTeamMember): TeamMember {
  return {
    id: Number(row.id),
    teamId: Number(row.teamId),
    memberId: Number(row.memberId),
    activeStartDate: formatKstDate(row.activeStartDate),
    activeEndDate: row.activeEndDate ? formatKstDate(row.activeEndDate) : null,
    role: row.role,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
