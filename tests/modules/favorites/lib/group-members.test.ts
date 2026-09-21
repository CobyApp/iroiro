import { describe, expect, it } from "vitest";
import {
  groupMembersByTeam,
  type FavoriteMemberItem,
  type FavoriteTeamItem,
} from "@/modules/favorites/lib/group-members";

const teams: FavoriteTeamItem[] = [
  { id: 1, name: "CUTIE STREET" },
  { id: 2, name: "FRUITS ZIPPER" },
  { id: 3, name: "MORE STAR" }, // 멤버 없음 → 섹션 생략
];

const members: FavoriteMemberItem[] = [
  { id: 10, name: "우메다 미유", teamIds: [1], displayOrderByTeam: { 1: 6 } },
  { id: 11, name: "후루사와 리사", teamIds: [1], displayOrderByTeam: { 1: 1 } },
  // 다중 소속 — teams 순서상 CUTIE STREET(1)이 대표, FRUITS ZIPPER 는 힌트
  { id: 12, name: "유닛 멤버", teamIds: [2, 1], displayOrderByTeam: { 1: 3, 2: 1 } },
  { id: 13, name: "마츠모토 카렌", teamIds: [2], displayOrderByTeam: { 2: 2 } },
  // 순번 없는 멤버는 이름순으로 뒤에
  { id: 14, name: "가나다 순번없음", teamIds: [2] },
  // 소속 없음 → 기타
  { id: 15, name: "무소속", teamIds: [] },
  // 알 수 없는 그룹 id 만 → 기타
  { id: 16, name: "미지그룹", teamIds: [999] },
];

describe("groupMembersByTeam", () => {
  const groups = groupMembersByTeam(teams, members);

  it("teams 순서로 섹션을 만들고, 멤버 없는 그룹은 생략, 기타는 마지막", () => {
    expect(groups.map((g) => g.team?.name ?? "기타")).toEqual([
      "CUTIE STREET",
      "FRUITS ZIPPER",
      "기타",
    ]);
  });

  it("섹션 안은 그룹별 노출 순번 → 이름순이고, 다중 소속 멤버는 대표 그룹에 한 번만 나온다", () => {
    const cs = groups[0];
    expect(cs.members.map((m) => m.name)).toEqual(["후루사와 리사", "유닛 멤버", "우메다 미유"]);
    expect(cs.members[1].otherTeamNames).toEqual(["FRUITS ZIPPER"]);
    // FRUITS ZIPPER 섹션에는 유닛 멤버가 중복 등장하지 않는다(체크박스 중복 제출 방지)
    const fz = groups[1];
    expect(fz.members.map((m) => m.name)).toEqual(["마츠모토 카렌", "가나다 순번없음"]);
    expect(fz.members.every((m) => m.otherTeamNames.length === 0)).toBe(true);
  });

  it("소속이 없거나 알 수 없는 그룹만 가진 멤버는 기타로 모인다", () => {
    const etc = groups[2];
    expect(etc.team).toBeNull();
    expect(etc.members.map((m) => m.name)).toEqual(["무소속", "미지그룹"]);
  });

  it("멤버가 없으면 빈 배열", () => {
    expect(groupMembersByTeam(teams, [])).toEqual([]);
  });
});
