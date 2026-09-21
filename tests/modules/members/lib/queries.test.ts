import { beforeEach, describe, expect, it, vi } from "vitest";

const tmFindMany = vi.fn();
const memberFindMany = vi.fn();
const memberFindUnique = vi.fn();

vi.mock("@/lib/catalog-db", () => ({
  catalogDb: {
    teamMember: { findMany: tmFindMany },
    member: { findMany: memberFindMany, findUnique: memberFindUnique },
  },
}));

function memberRow(id: bigint, name: string) {
  return {
    id,
    name,
    nameI18n: null,
    debutDate: null,
    retireDate: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function tmRow(
  id: bigint,
  teamId: bigint,
  memberId: bigint,
  displayOrder: number | null = null,
) {
  return {
    id,
    teamId,
    memberId,
    activeStartDate: new Date("2022-07-22T00:00:00Z"),
    activeEndDate: null,
    role: null,
    displayOrder,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

beforeEach(() => {
  vi.resetModules();
  tmFindMany.mockReset().mockResolvedValue([]);
  memberFindMany.mockReset().mockResolvedValue([]);
  memberFindUnique.mockReset().mockResolvedValue(null);
});

describe("members queries", () => {
  describe("listMembers (teamId 지정)", () => {
    it("그룹 스코프 + displayOrder 정렬 인자로 조회한다", async () => {
      // 1차: 그룹 멤버십(멤버 relation 포함), 2차: 해당 멤버들의 전체 멤버십
      tmFindMany
        .mockResolvedValueOnce([
          { ...tmRow(1n, 1n, 1n, 1), member: memberRow(1n, "민지") },
          { ...tmRow(2n, 1n, 2n, 2), member: memberRow(2n, "하니") },
        ])
        .mockResolvedValueOnce([tmRow(1n, 1n, 1n, 1), tmRow(2n, 1n, 2n, 2)]);
      const { listMembers } = await import("@/modules/members/lib/queries");
      const result = await listMembers(1);

      expect(tmFindMany.mock.calls[0][0].where).toEqual({ teamId: 1n });
      expect(result.map((m) => m.name)).toEqual(["민지", "하니"]);
      expect(result.every((m) => m.teamIds.includes(1))).toBe(true);
    });

    it("매칭 그룹이 없으면 빈 배열", async () => {
      tmFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const { listMembers } = await import("@/modules/members/lib/queries");
      expect(await listMembers(9999)).toEqual([]);
    });
  });

  describe("listMembers (전체)", () => {
    it("멤버십 정렬 순서대로 멤버를 중복 없이 배치한다", async () => {
      // DB가 (team.name, display_order, member.name) 순으로 정렬해 반환한 상태를 재현
      tmFindMany.mockResolvedValueOnce([
        {
          ...tmRow(1n, 1n, 1n, 1),
          team: { id: 1n, name: "뉴진스" },
          member: memberRow(1n, "민지"),
        },
        {
          ...tmRow(2n, 1n, 2n, 2),
          team: { id: 1n, name: "뉴진스" },
          member: memberRow(2n, "하니"),
        },
        {
          ...tmRow(3n, 2n, 3n, 1),
          team: { id: 2n, name: "아이브" },
          member: memberRow(3n, "안유진"),
        },
      ]);
      memberFindMany.mockResolvedValue([
        memberRow(1n, "민지"),
        memberRow(3n, "안유진"),
        memberRow(2n, "하니"),
      ]);
      const { listMembers } = await import("@/modules/members/lib/queries");
      const result = await listMembers();

      expect(result.map((m) => m.name)).toEqual(["민지", "하니", "안유진"]);
    });

    it("멤버십이 없는 멤버는 그룹 멤버들 뒤에 배치된다", async () => {
      tmFindMany.mockResolvedValueOnce([
        {
          ...tmRow(1n, 1n, 1n, 1),
          team: { id: 1n, name: "뉴진스" },
          member: memberRow(1n, "민지"),
        },
      ]);
      memberFindMany.mockResolvedValue([
        memberRow(1n, "민지"),
        memberRow(4n, "솔로멤버"),
      ]);
      const { listMembers } = await import("@/modules/members/lib/queries");
      const result = await listMembers();

      expect(result.map((m) => m.name)).toEqual(["민지", "솔로멤버"]);
      expect(result[1].teamIds).toEqual([]);
    });
  });

  describe("getMemberById", () => {
    it("존재하는 id로 멤버와 소속 그룹을 반환한다", async () => {
      memberFindUnique.mockResolvedValue(memberRow(1n, "민지"));
      tmFindMany.mockResolvedValue([tmRow(1n, 1n, 1n, 1)]);
      const { getMemberById } = await import("@/modules/members/lib/queries");
      const result = await getMemberById(1);

      expect(memberFindUnique).toHaveBeenCalledWith({ where: { id: 1n } });
      expect(result?.id).toBe(1);
      expect(result?.teamIds).toEqual([1]);
    });

    it("존재하지 않는 id면 null을 반환한다", async () => {
      const { getMemberById } = await import("@/modules/members/lib/queries");
      expect(await getMemberById(9999)).toBeNull();
    });
  });
});
