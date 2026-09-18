import "server-only";

import { db } from "@/lib/db";
import { toMember, withTeams } from "./transform";
import type { MemberWithTeams } from "../types";
import type { TeamMember as PrismaTeamMember } from "@prisma/client";

/**
 * 멤버 목록을 그룹명·순번·멤버명 순으로 정렬해 반환.
 *
 * `team_member`를 team과 relation 조인하여 단일 쿼리로 (team.name,
 * display_order, member.name) 순서 정렬. `team_member_team_order_idx` +
 * `team_name_idx`가 활용되도록 구성.
 *
 * 같은 멤버가 여러 그룹에 속하면 멤버십별로 그룹화되며 멤버 단위의 첫 등장
 * 순서는 가장 앞쪽 멤버십의 (team.name, display_order)를 따른다. 멤버십이 없는
 * 멤버는 최하단에 멤버명 순으로 배치된다.
 */
export async function listMembers(
  teamId?: number,
): Promise<MemberWithTeams[]> {
  if (teamId !== undefined) {
    const tmRows = await db.teamMember.findMany({
      where: { teamId: BigInt(teamId) },
      include: { member: true },
      orderBy: [
        { displayOrder: { sort: "asc", nulls: "last" } },
        { member: { name: "asc" } },
      ],
    });

    const memberIds = Array.from(new Set(tmRows.map((tm) => tm.memberId)));
    const allTms = await db.teamMember.findMany({
      where: { memberId: { in: memberIds } },
    });

    return tmRows.map((row) =>
      withTeams(toMember(row.member), allTms as PrismaTeamMember[]),
    );
  }

  const [tmRows, memberRows] = await Promise.all([
    db.teamMember.findMany({
      include: { team: true, member: true },
      orderBy: [
        { team: { name: "asc" } },
        { displayOrder: { sort: "asc", nulls: "last" } },
        { member: { name: "asc" } },
      ],
    }),
    db.member.findMany({ orderBy: { name: "asc" } }),
  ]);

  const memberships = tmRows as unknown as PrismaTeamMember[];
  const memberById = new Map(memberRows.map((m) => [m.id.toString(), m]));

  const ordered: MemberWithTeams[] = [];
  const seen = new Set<string>();
  for (const tm of tmRows) {
    const key = tm.memberId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const memberRow = memberById.get(key);
    if (!memberRow) continue;
    ordered.push(withTeams(toMember(memberRow), memberships));
  }

  for (const memberRow of memberRows) {
    const key = memberRow.id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(withTeams(toMember(memberRow), memberships));
  }

  return ordered;
}

export async function getMemberById(
  id: number,
): Promise<MemberWithTeams | null> {
  const [memberRow, tmRows] = await Promise.all([
    db.member.findUnique({ where: { id: BigInt(id) } }),
    db.teamMember.findMany({ where: { memberId: BigInt(id) } }),
  ]);

  if (!memberRow) return null;
  return withTeams(toMember(memberRow), tmRows);
}
