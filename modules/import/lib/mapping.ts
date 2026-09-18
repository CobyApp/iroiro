// 외부 카드 → 이로이로 상품 프리필 매핑 (순수 함수, node 테스트 가능).

export type MappableCard = {
  name: string;
  item_code: string;
  description: string | null;
  team_id: string;
  market_avg_jpy: number;
  retail_price_jpy: number;
  source_url: string | null;
  member: { name_ko: string; name_ja: string; name_romaji?: string };
};

export type MemberRef = { id: number; name: string; nameJa: string | null };
export type TeamRef = { id: number; name: string };

// 외부 member.name_ko(한글) 또는 name_ja(일본어)로 이로이로 멤버 매칭.
export function matchMemberId(
  card: MappableCard,
  members: MemberRef[],
): number | null {
  const found = members.find(
    (m) =>
      m.name === card.member.name_ko ||
      (m.nameJa !== null && m.nameJa === card.member.name_ja),
  );
  return found?.id ?? null;
}

// 외부 team_id("CUTIE_STREET") ↔ 팀 이름 정규화 매칭.
export function matchTeamId(
  card: MappableCard,
  teams: TeamRef[],
): number | null {
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "_");
  const found = teams.find((t) => norm(t.name) === norm(card.team_id));
  return found?.id ?? null;
}

// 외부 team_id 슬러그("CUTIE_STREET")를 사람이 읽는 그룹명("CUTIE STREET")으로.
// API가 그룹 표시명을 따로 주지 않아 자동 생성 시 이 이름을 쓴다(관리자 수정 가능).
export function teamNameFromSlug(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

// 자동 생성 멤버의 표시명 — 한글 우선, 없으면 일본어.
export function memberNameOf(card: MappableCard): string {
  return card.member.name_ko.trim() || card.member.name_ja.trim();
}

export type MemberI18n = { "ja-jpan"?: string; en?: string };

// 자동 생성 멤버의 nameI18n — 일본어·로마자 중 있는 것만. 전부 없으면 null.
export function buildMemberI18n(member: MappableCard["member"]): MemberI18n | null {
  const out: MemberI18n = {};
  if (member.name_ja.trim()) out["ja-jpan"] = member.name_ja.trim();
  if (member.name_romaji?.trim()) out.en = member.name_romaji.trim();
  return Object.keys(out).length > 0 ? out : null;
}

export type ImportPrefill = {
  name: string;
  itemCode: string;
  description: string;
  teamId: number | null;
  memberId: number | null;
  marketAvgJpy: number;
  retailJpy: number;
  sourceUrl: string;
  // 매칭 실패 시 자동 생성될 그룹·멤버 이름(안내용).
  autoTeamName: string;
  autoMemberName: string;
};

export function buildImportPrefill(
  card: MappableCard,
  members: MemberRef[],
  teams: TeamRef[],
): ImportPrefill {
  return {
    name: card.name,
    itemCode: card.item_code,
    description: card.description ?? "",
    teamId: matchTeamId(card, teams),
    memberId: matchMemberId(card, members),
    marketAvgJpy: card.market_avg_jpy,
    retailJpy: card.retail_price_jpy,
    sourceUrl: card.source_url ?? "",
    autoTeamName: teamNameFromSlug(card.team_id),
    autoMemberName: memberNameOf(card),
  };
}
