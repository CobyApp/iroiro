import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { todayKstYmd } from "@/lib/datetime";
import { listCardsForExport } from "@/modules/cards/lib/queries";
import {
  CARD_SOURCES,
  CARD_STATUSES,
  cardBackUrl,
  cardFrontUrl,
  type CardSource,
  type CardStatus,
} from "@/modules/cards/types";

// 토레카 데이터 CSV 내보내기 — 목록 필터를 그대로 이어받는다.
// UTF-8 BOM을 붙여 Excel에서 한글이 깨지지 않게 한다.

function csvField(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account || !isAdmin(account)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const teamId = Number(sp.get("team")) > 0 ? Number(sp.get("team")) : undefined;
  const memberId =
    Number(sp.get("member")) > 0 ? Number(sp.get("member")) : undefined;
  const seriesId =
    Number(sp.get("series")) > 0 ? Number(sp.get("series")) : undefined;
  const source = CARD_SOURCES.includes(sp.get("source") as CardSource)
    ? (sp.get("source") as CardSource)
    : undefined;
  const status = CARD_STATUSES.includes(sp.get("status") as CardStatus)
    ? (sp.get("status") as CardStatus)
    : undefined;

  const [cards, teams, members, seriesRows] = await Promise.all([
    listCardsForExport({ teamId, memberId, seriesId, source, status }),
    listTeams(),
    listMembers(),
    db.series.findMany({ select: { id: true, sku: true, label: true, kind: true } }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t.name]));
  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const seriesById = new Map(
    seriesRows.map((s) => [Number(s.id), s]),
  );

  const header = [
    "id", "source", "status", "item_code", "item_type",
    "team", "member", "series_sku", "series_kind", "series_label",
    "name", "pose", "description",
    "market_avg_jpy", "market_min_jpy", "market_max_jpy", "market_sold_count",
    "retail_price_jpy", "front_image", "back_image", "created_at",
  ];
  const lines = [header.join(",")];
  for (const card of cards) {
    const series =
      card.seriesId !== null ? seriesById.get(card.seriesId) : undefined;
    lines.push(
      [
        card.id,
        card.source,
        card.status,
        csvField(card.itemCode),
        card.itemType,
        csvField(card.teamId !== null ? (teamById.get(card.teamId) ?? "") : ""),
        csvField(
          card.memberId !== null ? (memberById.get(card.memberId) ?? "") : "",
        ),
        csvField(series?.sku ?? ""),
        csvField(series?.kind ?? ""),
        csvField(series?.label ?? ""),
        csvField(card.name),
        card.pose,
        csvField(card.description),
        card.marketAvgJpy,
        card.marketMinJpy,
        card.marketMaxJpy,
        card.marketSoldCount,
        card.retailPriceJpy,
        csvField(cardFrontUrl(card, env.R2_PUBLIC_BASE)),
        csvField(cardBackUrl(card, env.R2_PUBLIC_BASE)),
        card.createdAt,
      ].join(","),
    );
  }

  const bom = "﻿";
  const today = todayKstYmd();
  return new NextResponse(bom + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="iroiro-cards-${today}.csv"`,
    },
  });
}
