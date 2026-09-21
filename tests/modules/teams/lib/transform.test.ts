import { describe, expect, it } from "vitest";
import type { Team as PrismaTeam } from "@/lib/generated/catalog-client";
import { toTeam } from "@/modules/teams/lib/transform";

const baseRow: PrismaTeam = {
  id: 42n,
  name: "뉴진스",
  nameI18n: { "ja-jpan": "ニュージーンズ", en: "NewJeans" },
  debutDate: new Date("2022-07-22T00:00:00.000Z"),
  disbandDate: null,
  displayOrder: 2,
  themeColor: "#FF6B9D",
  createdAt: new Date("2026-05-01T10:00:00.000Z"),
  createdBy: null,
  updatedAt: new Date("2026-05-01T10:00:00.000Z"),
  updatedBy: null,
};

describe("toTeam", () => {
  it("BigInt id를 number로 변환한다", () => {
    expect(toTeam(baseRow).id).toBe(42);
  });

  it("Date를 YYYY-MM-DD ISO date string으로 변환한다", () => {
    expect(toTeam(baseRow).debutDate).toBe("2022-07-22");
  });

  it("null Date는 그대로 null을 유지한다", () => {
    expect(toTeam(baseRow).disbandDate).toBeNull();
  });

  it("nameI18n JSON을 NameI18n 객체로 노출한다", () => {
    expect(toTeam(baseRow).nameI18n).toEqual({
      "ja-jpan": "ニュージーンズ",
      en: "NewJeans",
    });
  });

  it("nameI18n이 null이면 null을 반환한다", () => {
    expect(toTeam({ ...baseRow, nameI18n: null }).nameI18n).toBeNull();
  });

  it("displayOrder(그룹 노출 순서)를 그대로 노출하고 없으면 null", () => {
    expect(toTeam(baseRow).displayOrder).toBe(2);
    expect(toTeam({ ...baseRow, displayOrder: null }).displayOrder).toBeNull();
  });

  it("createdAt/updatedAt은 full ISO timestamp", () => {
    const team = toTeam(baseRow);
    expect(team.createdAt).toBe("2026-05-01T10:00:00.000Z");
    expect(team.updatedAt).toBe("2026-05-01T10:00:00.000Z");
  });
});
