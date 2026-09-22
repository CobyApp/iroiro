import { describe, expect, it } from "vitest";
import type { TeamMember as PrismaTeamMember } from "@prisma/client";
import { toTeamMember } from "@/modules/team-members/lib/transform";

const row: PrismaTeamMember = {
  id: 12n,
  teamId: 3n,
  memberId: 8n,
  activeStartDate: new Date("2022-07-22T00:00:00.000Z"),
  activeEndDate: new Date("2024-01-15T00:00:00.000Z"),
  role: "리더",
  displayOrder: 1,
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  createdBy: null,
  updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  updatedBy: null,
};

describe("toTeamMember", () => {
  it("BigInt 필드를 number로 변환한다", () => {
    const tm = toTeamMember(row);
    expect(tm.id).toBe(12);
    expect(tm.teamId).toBe(3);
    expect(tm.memberId).toBe(8);
  });

  it("Date를 YYYY-MM-DD로 변환한다", () => {
    const tm = toTeamMember(row);
    expect(tm.activeStartDate).toBe("2022-07-22");
    expect(tm.activeEndDate).toBe("2024-01-15");
  });

  it("activeEndDate가 null이면 그대로 null", () => {
    expect(toTeamMember({ ...row, activeEndDate: null }).activeEndDate).toBeNull();
  });

  it("role·displayOrder를 그대로 노출한다", () => {
    const tm = toTeamMember(row);
    expect(tm.role).toBe("리더");
    expect(tm.displayOrder).toBe(1);
  });
});
