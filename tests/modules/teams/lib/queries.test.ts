import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { team: { findMany, findUnique } },
}));

const row = {
  id: 1n,
  name: "뉴진스",
  nameI18n: { "ja-jpan": "ニュージーンズ", en: "NewJeans" },
  debutDate: null,
  disbandDate: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset().mockResolvedValue([row]);
  findUnique.mockReset().mockResolvedValue(row);
});

describe("teams queries", () => {
  describe("listTeams", () => {
    it("name 오름차순으로 조회하고 DTO로 변환한다", async () => {
      const { listTeams } = await import("@/modules/teams/lib/queries");
      const result = await listTeams();

      expect(findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
      expect(result[0]).toMatchObject({ id: 1, name: "뉴진스" });
      expect(result[0].nameI18n).toEqual({
        "ja-jpan": "ニュージーンズ",
        en: "NewJeans",
      });
    });
  });

  describe("getTeamById", () => {
    it("BigInt id로 단건 조회한다", async () => {
      const { getTeamById } = await import("@/modules/teams/lib/queries");
      const result = await getTeamById(1);

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 1n } });
      expect(result?.id).toBe(1);
    });

    it("존재하지 않는 id면 null을 반환한다", async () => {
      findUnique.mockResolvedValue(null);
      const { getTeamById } = await import("@/modules/teams/lib/queries");
      expect(await getTeamById(9999)).toBeNull();
    });
  });
});
