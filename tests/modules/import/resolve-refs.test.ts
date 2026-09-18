import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MappableCard } from "@/modules/import/lib/mapping";

const { teamCreate, memberCreate, teamMemberCreate, teamFindMany, memberFindMany } =
  vi.hoisted(() => ({
    teamCreate: vi.fn(),
    memberCreate: vi.fn(),
    teamMemberCreate: vi.fn(),
    teamFindMany: vi.fn(),
    memberFindMany: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    team: { create: teamCreate, findMany: teamFindMany },
    member: { findMany: memberFindMany },
    series: { findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        member: { create: memberCreate },
        teamMember: { create: teamMemberCreate },
      }),
  },
}));
vi.mock("@/lib/datetime", () => ({ todayKstYmd: () => "2026-08-20" }));

import {
  loadRefsCache,
  resolveImportRefs,
  type RefsCache,
} from "@/modules/import/lib/resolve-refs";

const card = (over: Partial<MappableCard["member"]> = {}, teamSlug = "CUTIE_STREET"): MappableCard => ({
  name: "카드",
  item_code: "CS-1",
  description: null,
  team_id: teamSlug,
  market_avg_jpy: 0,
  retail_price_jpy: 0,
  source_url: null,
  member: { name_ko: "카와모토 에미루", name_ja: "川本笑瑠", name_romaji: "Kawamoto Emiru", ...over },
});

beforeEach(() => {
  teamCreate.mockReset();
  memberCreate.mockReset();
  teamMemberCreate.mockReset();
  teamFindMany.mockReset();
  memberFindMany.mockReset();
});

describe("resolveImportRefs", () => {
  it("기존 그룹·멤버가 있으면 생성 없이 매핑한다", async () => {
    const cache: RefsCache = {
      series: [],
      teams: [{ id: 1, name: "CUTIE STREET" }],
      members: [{ id: 10, name: "카와모토 에미루", nameJa: "川本笑瑠" }],
    };
    const refs = await resolveImportRefs(card(), cache);
    expect(refs).toEqual({ teamId: 1, memberId: 10 });
    expect(teamCreate).not.toHaveBeenCalled();
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it("없는 그룹·멤버는 생성하고, 멤버는 그룹 소속까지 등록한다", async () => {
    teamCreate.mockResolvedValue({ id: BigInt(7) });
    memberCreate.mockResolvedValue({ id: BigInt(70) });
    const cache: RefsCache = { series: [], teams: [], members: [] };

    const refs = await resolveImportRefs(card(), cache);

    expect(refs).toEqual({ teamId: 7, memberId: 70 });
    expect(teamCreate).toHaveBeenCalledWith({ data: { name: "CUTIE STREET" } });
    expect(memberCreate).toHaveBeenCalledWith({
      data: {
        name: "카와모토 에미루",
        nameI18n: { "ja-jpan": "川本笑瑠", en: "Kawamoto Emiru" },
      },
    });
    expect(teamMemberCreate).toHaveBeenCalledWith({
      data: {
        memberId: BigInt(70),
        teamId: BigInt(7),
        activeStartDate: new Date("2026-08-20"),
      },
    });
  });

  it("같은 배치에서 같은 그룹·멤버는 한 번만 생성한다(캐시)", async () => {
    teamCreate.mockResolvedValue({ id: BigInt(7) });
    memberCreate.mockResolvedValue({ id: BigInt(70) });
    const cache: RefsCache = { series: [], teams: [], members: [] };

    const first = await resolveImportRefs(card(), cache);
    const second = await resolveImportRefs(card(), cache);

    expect(second).toEqual(first);
    expect(teamCreate).toHaveBeenCalledTimes(1);
    expect(memberCreate).toHaveBeenCalledTimes(1);
  });

  it("같은 그룹의 다른 멤버는 멤버만 새로 만든다", async () => {
    memberCreate.mockResolvedValue({ id: BigInt(71) });
    const cache: RefsCache = {
      series: [],
      teams: [{ id: 1, name: "CUTIE STREET" }],
      members: [{ id: 10, name: "카와모토 에미루", nameJa: "川本笑瑠" }],
    };

    const refs = await resolveImportRefs(
      card({ name_ko: "사노 아이카", name_ja: "佐野愛花", name_romaji: "Sano Aika" }),
      cache,
    );

    expect(refs).toEqual({ teamId: 1, memberId: 71 });
    expect(teamCreate).not.toHaveBeenCalled();
    expect(teamMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teamId: BigInt(1) }) }),
    );
  });

  it("한글 이름이 없으면 일본어 이름으로 만든다", async () => {
    memberCreate.mockResolvedValue({ id: BigInt(72) });
    const cache: RefsCache = { series: [], teams: [{ id: 1, name: "CUTIE STREET" }], members: [] };

    await resolveImportRefs(card({ name_ko: "", name_ja: "真鍋凪咲", name_romaji: "" }), cache);

    expect(memberCreate).toHaveBeenCalledWith({
      data: { name: "真鍋凪咲", nameI18n: { "ja-jpan": "真鍋凪咲" } },
    });
  });
});

describe("loadRefsCache", () => {
  it("DB의 그룹·멤버를 매칭용 캐시로 변환한다", async () => {
    teamFindMany.mockResolvedValue([{ id: BigInt(1), name: "CUTIE STREET" }]);
    memberFindMany.mockResolvedValue([
      { id: BigInt(10), name: "카와모토 에미루", nameI18n: { "ja-jpan": "川本笑瑠" } },
      { id: BigInt(11), name: "사노 아이카", nameI18n: null },
    ]);

    const cache = await loadRefsCache();

    expect(cache.teams).toEqual([{ id: 1, name: "CUTIE STREET" }]);
    expect(cache.members).toEqual([
      { id: 10, name: "카와모토 에미루", nameJa: "川本笑瑠" },
      { id: 11, name: "사노 아이카", nameJa: null },
    ]);
  });
});
