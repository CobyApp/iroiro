// 최애 선택 화면용 — 멤버 칩을 그룹별 섹션으로 묶는다(순수 함수).
//
// 왜: 멤버를 평면 목록으로 보여주면 같은 이름·비슷한 이름이 어느 그룹인지 구분이 어렵고,
// 여러 그룹(유닛)에서 활동하는 멤버는 더 헷갈린다. 그룹 섹션으로 나누고, 다중 소속 멤버는
// **대표 그룹(teams 순서상 첫 그룹) 아래 한 번만** 두고 나머지 그룹명을 힌트로 붙인다 —
// 두 섹션에 중복으로 두면 네이티브 체크박스(회원가입 폼)가 같은 값을 두 번 제출하고
// 한쪽만 토글되는 불일치가 생긴다.

export type FavoriteTeamItem = { id: number; name: string };

export type FavoriteMemberItem = {
  id: number;
  name: string;
  /** 소속 그룹 id 전체. 비어 있으면 "기타" 섹션. */
  teamIds: number[];
  /** 그룹별 노출 순번(team_member.display_order). 없으면 이름순. */
  displayOrderByTeam?: Record<number, number | null>;
};

export type GroupedFavoriteMember = {
  id: number;
  name: string;
  /** 대표 그룹 외 소속 그룹 이름들 — 칩 힌트로 표시. */
  otherTeamNames: string[];
};

export type FavoriteMemberGroup = {
  /** null 이면 소속 그룹이 없는 멤버 묶음("기타"). 항상 마지막. */
  team: FavoriteTeamItem | null;
  members: GroupedFavoriteMember[];
};

export function groupMembersByTeam(
  teams: FavoriteTeamItem[],
  members: FavoriteMemberItem[],
): FavoriteMemberGroup[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rank = new Map(teams.map((t, i) => [t.id, i]));

  type Row = GroupedFavoriteMember & { order: number | null };
  const buckets = new Map<number | null, Row[]>();

  for (const m of members) {
    // 알 수 없는 그룹 id 는 무시하고, teams 순서로 정렬해 첫 그룹을 대표로.
    const known = m.teamIds
      .filter((id) => teamById.has(id))
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    const primary = known[0] ?? null;
    const otherTeamNames = known.slice(1).map((id) => teamById.get(id)!.name);
    const order = primary === null ? null : (m.displayOrderByTeam?.[primary] ?? null);
    const list = buckets.get(primary) ?? [];
    list.push({ id: m.id, name: m.name, otherTeamNames, order });
    buckets.set(primary, list);
  }

  const sortRows = (rows: Row[]): GroupedFavoriteMember[] =>
    [...rows]
      .sort((a, b) => {
        const ao = a.order ?? Number.POSITIVE_INFINITY;
        const bo = b.order ?? Number.POSITIVE_INFINITY;
        return ao - bo || a.name.localeCompare(b.name, "ko");
      })
      .map((r) => ({ id: r.id, name: r.name, otherTeamNames: r.otherTeamNames }));

  const out: FavoriteMemberGroup[] = [];
  for (const t of teams) {
    const rows = buckets.get(t.id);
    if (rows && rows.length > 0) out.push({ team: t, members: sortRows(rows) });
  }
  const orphans = buckets.get(null);
  if (orphans && orphans.length > 0) out.push({ team: null, members: sortRows(orphans) });
  return out;
}
