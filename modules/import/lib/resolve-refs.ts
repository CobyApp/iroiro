import "server-only";

import { db } from "@/lib/db";
import { todayKstYmd } from "@/lib/datetime";
import {
  buildMemberI18n,
  matchMemberId,
  matchTeamId,
  memberNameOf,
  teamNameFromSlug,
  type MappableCard,
  type MemberRef,
  type TeamRef,
} from "./mapping";

// 카드의 그룹·멤버를 우리 DB에 매핑 — 없으면 자동 생성(find-or-create).
// cache는 호출 측이 만들어 넘기고, 생성 시 여기서 push해 같은 배치 내
// 중복 생성을 막는다. (관리자 단일 세션 도구 — 동시 배치 경합은 고려하지 않음)

export type SeriesRef = { id: number; sku: string };

export type RefsCache = {
  teams: TeamRef[];
  members: MemberRef[];
  series: SeriesRef[];
};

export async function loadRefsCache(): Promise<RefsCache> {
  const [teamRows, memberRows, seriesRows] = await Promise.all([
    db.team.findMany({ select: { id: true, name: true } }),
    db.member.findMany({ select: { id: true, name: true, nameI18n: true } }),
    db.series.findMany({ select: { id: true, sku: true } }),
  ]);
  return {
    series: seriesRows.map((s) => ({ id: Number(s.id), sku: s.sku })),
    teams: teamRows.map((t) => ({ id: Number(t.id), name: t.name })),
    members: memberRows.map((m) => ({
      id: Number(m.id),
      name: m.name,
      nameJa:
        ((m.nameI18n as Record<string, unknown> | null)?.["ja-jpan"] as
          | string
          | undefined) ?? null,
    })),
  };
}

export async function resolveImportRefs(
  card: MappableCard,
  cache: RefsCache,
): Promise<{ teamId: number; memberId: number }> {
  // 그룹 — team_id 슬러그 정규화 매칭, 없으면 생성.
  let teamId = matchTeamId(card, cache.teams);
  if (teamId === null) {
    const name = teamNameFromSlug(card.team_id) || "미분류";
    const row = await db.team.create({ data: { name } });
    teamId = Number(row.id);
    cache.teams.push({ id: teamId, name });
  }

  // 멤버 — 한글/일본어 이름 매칭, 없으면 생성 + 위 그룹 소속 1건 등록.
  let memberId = matchMemberId(card, cache.members);
  if (memberId === null) {
    const name = memberNameOf(card) || "미상";
    const nameI18n = buildMemberI18n(card.member);
    const teamIdBig = BigInt(teamId);
    const row = await db.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: { name, nameI18n: nameI18n ?? undefined },
      });
      // 활동 시작일은 알 수 없어 가져온 날짜로 둔다(관리자 수정 가능).
      await tx.teamMember.create({
        data: {
          memberId: member.id,
          teamId: teamIdBig,
          activeStartDate: new Date(todayKstYmd()),
        },
      });
      return member;
    });
    memberId = Number(row.id);
    cache.members.push({
      id: memberId,
      name,
      nameJa: card.member.name_ja.trim() || null,
    });
  }

  return { teamId, memberId };
}

export type SeriesSource = {
  sku: string;
  kind: string;
  label: string;
  product_url: string | null;
};

// 시리즈 find-or-create — sku가 멱등 키. 그룹→멤버→종류→시리즈 계층의 최하위를
// 임포트가 자동으로 채운다(없는 시리즈는 생성, 관리자 수정 가능).
export async function resolveSeriesId(
  series: SeriesSource | null | undefined,
  teamId: number,
  cache: RefsCache,
): Promise<number | null> {
  if (!series || !series.sku.trim()) return null;
  const sku = series.sku.trim();
  const hit = cache.series.find((s) => s.sku === sku);
  if (hit) return hit.id;
  const row = await db.series.create({
    data: {
      sku,
      teamId: BigInt(teamId),
      kind: series.kind || "unknown",
      label: series.label || sku,
      productUrl: series.product_url,
    },
  });
  const id = Number(row.id);
  cache.series.push({ id, sku });
  return id;
}
