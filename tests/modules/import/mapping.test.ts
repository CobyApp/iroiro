import { describe, expect, it } from "vitest";
import {
  buildImportPrefill,
  buildMemberI18n,
  matchMemberId,
  matchTeamId,
  memberNameOf,
  teamNameFromSlug,
  type MappableCard,
} from "@/modules/import/lib/mapping";

const card: MappableCard = {
  name: "카와모토 에미루 · たすき衣装",
  item_code: "CS-0225",
  description: "たすき衣装",
  team_id: "CUTIE_STREET",
  market_avg_jpy: 895,
  retail_price_jpy: 0,
  source_url: "https://jp.mercari.com/x",
  member: { name_ko: "카와모토 에미루", name_ja: "川本笑瑠" },
};

const members = [
  { id: 10, name: "카와모토 에미루", nameJa: "川本笑瑠" },
  { id: 11, name: "사노 아이카", nameJa: "佐野愛花" },
];
const teams = [{ id: 1, name: "CUTIE STREET" }];

describe("matchMemberId", () => {
  it("한글 이름으로 매칭", () => {
    expect(matchMemberId(card, members)).toBe(10);
  });
  it("일본어 이름으로도 매칭", () => {
    const c = { ...card, member: { name_ko: "다른이름", name_ja: "川本笑瑠" } };
    expect(matchMemberId(c, members)).toBe(10);
  });
  it("매칭 실패 시 null", () => {
    expect(
      matchMemberId(
        { ...card, member: { name_ko: "없음", name_ja: "無" } },
        members,
      ),
    ).toBeNull();
  });
});

describe("matchTeamId", () => {
  it("CUTIE_STREET ↔ 'CUTIE STREET' 정규화 매칭", () => {
    expect(matchTeamId(card, teams)).toBe(1);
  });
});

describe("buildImportPrefill", () => {
  it("이름·SKU·매칭 id·시세를 채운다", () => {
    const p = buildImportPrefill(card, members, teams);
    expect(p).toMatchObject({
      name: "카와모토 에미루 · たすき衣装",
      itemCode: "CS-0225",
      teamId: 1,
      memberId: 10,
      marketAvgJpy: 895,
    });
  });

  it("자동 생성 안내용 그룹·멤버 이름을 채운다", () => {
    const p = buildImportPrefill(card, [], []);
    expect(p.teamId).toBeNull();
    expect(p.memberId).toBeNull();
    expect(p.autoTeamName).toBe("CUTIE STREET");
    expect(p.autoMemberName).toBe("카와모토 에미루");
  });
});

describe("teamNameFromSlug", () => {
  it("언더스코어 슬러그를 공백 이름으로", () => {
    expect(teamNameFromSlug("CUTIE_STREET")).toBe("CUTIE STREET");
    expect(teamNameFromSlug("FRUITS_ZIPPER")).toBe("FRUITS ZIPPER");
    expect(teamNameFromSlug("  A__B ")).toBe("A B");
  });
});

describe("memberNameOf", () => {
  it("한글 우선, 없으면 일본어", () => {
    expect(memberNameOf(card)).toBe("카와모토 에미루");
    expect(
      memberNameOf({ ...card, member: { name_ko: " ", name_ja: "川本笑瑠" } }),
    ).toBe("川本笑瑠");
  });
});

describe("buildMemberI18n", () => {
  it("일본어·로마자 중 있는 것만 담는다", () => {
    expect(
      buildMemberI18n({ name_ko: "a", name_ja: "川本笑瑠", name_romaji: "Kawamoto Emiru" }),
    ).toEqual({ "ja-jpan": "川本笑瑠", en: "Kawamoto Emiru" });
    expect(buildMemberI18n({ name_ko: "a", name_ja: "川本笑瑠" })).toEqual({
      "ja-jpan": "川本笑瑠",
    });
    expect(buildMemberI18n({ name_ko: "a", name_ja: " " })).toBeNull();
  });
});
