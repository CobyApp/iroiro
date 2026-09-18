import "server-only";

import { db } from "@/lib/db";
import { toTeam } from "./transform";
import type { Team } from "../types";

export async function listTeams(): Promise<Team[]> {
  const rows = await db.team.findMany({ orderBy: { name: "asc" } });
  return rows.map(toTeam);
}

export async function getTeamById(id: number): Promise<Team | null> {
  const row = await db.team.findUnique({ where: { id: BigInt(id) } });
  return row ? toTeam(row) : null;
}
