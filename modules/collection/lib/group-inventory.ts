import type { InventoryEntry } from "../types";

// 구매 카드(InventoryEntry)를 그룹(팀)/멤버별로 분류 — 순수 함수(node 테스트 가능).
// 입력 순서(획득 최신순)를 그룹·멤버 등장 순서로 보존.

type GroupableEntry = Omit<InventoryEntry, "productThumbnailKey">;

export type OwnedMemberGroup<T extends GroupableEntry = InventoryEntry> = {
  memberId: number | null;
  memberName: string;
  entries: T[];
  cardCount: number;
};

export type OwnedTeamGroup<T extends GroupableEntry = InventoryEntry> = {
  teamId: number | null;
  teamName: string;
  members: OwnedMemberGroup<T>[];
  cardCount: number;
};

export function groupOwnedCards<T extends GroupableEntry>(
  entries: T[],
  teamNames: Record<number, string>,
  memberNames: Record<number, string>,
): OwnedTeamGroup<T>[] {
  const teams = new Map<string, OwnedTeamGroup<T>>();

  for (const e of entries) {
    const tKey = e.teamId === null ? "_" : String(e.teamId);
    let team = teams.get(tKey);
    if (!team) {
      team = {
        teamId: e.teamId,
        teamName:
          e.teamId !== null ? (teamNames[e.teamId] ?? "기타 그룹") : "기타 그룹",
        members: [],
        cardCount: 0,
      };
      teams.set(tKey, team);
    }

    const mKey = e.memberId === null ? "_" : String(e.memberId);
    let member = team.members.find(
      (m) => (m.memberId === null ? "_" : String(m.memberId)) === mKey,
    );
    if (!member) {
      member = {
        memberId: e.memberId,
        memberName:
          e.memberId !== null
            ? (memberNames[e.memberId] ?? "기타 멤버")
            : "기타 멤버",
        entries: [],
        cardCount: 0,
      };
      team.members.push(member);
    }

    member.entries.push(e);
    member.cardCount += e.quantity;
    team.cardCount += e.quantity;
  }

  return [...teams.values()];
}
