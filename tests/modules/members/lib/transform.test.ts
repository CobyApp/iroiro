import { describe, expect, it } from "vitest";
import type {
  Member as PrismaMember,
  TeamMember as PrismaTeamMember,
} from "@prisma/client";
import { toMember, withTeams } from "@/modules/members/lib/transform";

const memberRow: PrismaMember = {
  id: 7n,
  name: "민지",
  nameI18n: { "ja-jpan": "ミンジ", "ja-hira": "みんじ" },
  debutDate: new Date("2022-07-22T00:00:00.000Z"),
  retireDate: null,
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  createdBy: null,
  updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  updatedBy: null,
};

const baseTm = (overrides: Partial<PrismaTeamMember>): PrismaTeamMember => ({
  id: 1n,
  teamId: 1n,
  memberId: 7n,
  activeStartDate: new Date("2022-07-22T00:00:00.000Z"),
  activeEndDate: null,
  role: null,
  displayOrder: null,
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  createdBy: null,
  updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  updatedBy: null,
  ...overrides,
});

describe("toMember", () => {
  it("BigInt id와 Date를 변환한다", () => {
    const member = toMember(memberRow);
    expect(member.id).toBe(7);
    expect(member.debutDate).toBe("2022-07-22");
    expect(member.retireDate).toBeNull();
  });
});

describe("withTeams", () => {
  it("memberId가 일치하는 활동 이력만 합쳐 teamIds·displayOrderByTeam·roleByTeam을 구성한다", () => {
    const member = toMember(memberRow);
    const memberships = [
      baseTm({ teamId: 1n, displayOrder: 2, role: "리더" }),
      baseTm({ teamId: 2n, displayOrder: 1, role: null }),
      baseTm({ memberId: 99n, teamId: 3n, role: "메인보컬" }),
    ];
    const result = withTeams(member, memberships);

    expect(result.teamIds.sort()).toEqual([1, 2]);
    expect(result.displayOrderByTeam[1]).toBe(2);
    expect(result.displayOrderByTeam[2]).toBe(1);
    expect(result.displayOrderByTeam[3]).toBeUndefined();
    expect(result.roleByTeam[1]).toBe("리더");
    expect(result.roleByTeam[2]).toBeNull();
    expect(result.roleByTeam[3]).toBeUndefined();
  });

  it("중복 teamId는 한 번만 등장한다", () => {
    const member = toMember(memberRow);
    const result = withTeams(member, [
      baseTm({ teamId: 1n, activeEndDate: new Date("2023-01-01") }),
      baseTm({ teamId: 1n }),
    ]);
    expect(result.teamIds).toEqual([1]);
  });

  it("memberships에 해당 멤버의 활동 이력 raw row가 모두 노출된다", () => {
    const member = toMember(memberRow);
    const result = withTeams(member, [
      baseTm({ id: 11n, teamId: 1n, role: "리더" }),
      baseTm({ id: 12n, teamId: 2n }),
      baseTm({ id: 99n, memberId: 999n, teamId: 3n }),
    ]);

    expect(result.memberships).toHaveLength(2);
    expect(result.memberships.map((tm) => tm.id).sort()).toEqual([11, 12]);
    expect(result.memberships[0].teamId).toBe(1);
    expect(result.memberships[0].role).toBe("리더");
  });
});
