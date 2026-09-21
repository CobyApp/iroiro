import "server-only";

import { catalogDb } from "@/lib/catalog-db";
import { toTeam } from "./transform";
import type { Team } from "../types";

// 그룹 목록 — 관리자 지정 순서(display_order, NULL 은 맨 뒤) → 이름. 고객·카탈로그 화면의 그룹 순서 단일 기준.
export async function listTeams(): Promise<Team[]> {
  const rows = await catalogDb.team.findMany({
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  return rows.map(toTeam);
}

export async function getTeamById(id: number): Promise<Team | null> {
  const row = await catalogDb.team.findUnique({ where: { id: BigInt(id) } });
  return row ? toTeam(row) : null;
}
