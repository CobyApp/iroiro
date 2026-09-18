import "server-only";

import type { Team as PrismaTeam } from "@prisma/client";
import type { NameI18n } from "@/lib/i18n";
import { formatKstDate } from "@/lib/datetime";
import type { Team } from "../types";

export function toTeam(row: PrismaTeam): Team {
  return {
    id: Number(row.id),
    name: row.name,
    nameI18n: (row.nameI18n as NameI18n | null) ?? null,
    debutDate: row.debutDate ? formatKstDate(row.debutDate) : null,
    disbandDate: row.disbandDate ? formatKstDate(row.disbandDate) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
