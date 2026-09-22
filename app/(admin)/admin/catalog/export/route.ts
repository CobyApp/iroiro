import { NextResponse, type NextRequest } from "next/server";
import archiver from "archiver";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { catalogDb } from "@/lib/catalog-db";
import { todayKstYmd } from "@/lib/datetime";
import { cardCleanKey } from "@/modules/cards/lib/image-keys";
import { fetchCatalogObject, readObjectBytes } from "@/lib/r2/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 이미지까지 스트리밍하므로 짧지 않다 — 최대 실행 시간을 넉넉히.
export const maxDuration = 300;

// 토레카 마스터 전체 내보내기(사진 포함) — site admin 전용.
// ZIP 구성: catalog.json(모든 테이블), cards.csv(스프레드시트용), images/<파일>.jpg(clean 원본).
// 카탈로그·커머스 DB 는 분리돼 있어 여기서는 카탈로그 DB + 카탈로그 버킷만 다룬다.

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}

function csvField(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_request: NextRequest) {
  const account = await getCurrentAccount();
  if (!account || !isAdmin(account)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const [teams, members, teamMembers, seriesKinds, series, cards] =
    await Promise.all([
      catalogDb.team.findMany({ orderBy: { id: "asc" } }),
      catalogDb.member.findMany({ orderBy: { id: "asc" } }),
      catalogDb.teamMember.findMany({ orderBy: { id: "asc" } }),
      catalogDb.seriesKind.findMany({ orderBy: { displayOrder: "asc" } }),
      catalogDb.series.findMany({ orderBy: { id: "asc" } }),
      catalogDb.card.findMany({ orderBy: { id: "asc" } }),
    ]);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const seriesById = new Map(series.map((s) => [s.id, s]));

  // catalog.json — 임베딩 벡터는 용량이 커서 제외(있음/없음만 표시).
  const catalogJson = jsonSafe({
    exportedAt: new Date().toISOString(),
    counts: {
      teams: teams.length,
      members: members.length,
      series: series.length,
      cards: cards.length,
    },
    teams,
    members,
    teamMembers,
    seriesKinds,
    series,
    cards: cards.map(({ analysisEmbedding, ...c }) => ({
      ...c,
      hasEmbedding: analysisEmbedding != null,
    })),
  });

  // cards.csv
  const header = [
    "id", "status", "item_code", "item_type", "team", "member",
    "series_sku", "series_kind", "series_label", "name", "pose",
    "retail_price_jpy", "image_file", "created_at",
  ];
  const imageName = (c: (typeof cards)[number]) =>
    c.frontR2Key ? `images/card-${c.id}-pose${c.pose}.jpg` : "";
  const csvLines = [header.join(",")];
  for (const c of cards) {
    const s = c.seriesId != null ? seriesById.get(c.seriesId) : undefined;
    csvLines.push(
      [
        c.id,
        c.status,
        c.itemCode,
        c.itemType,
        c.teamId != null ? teamName.get(c.teamId) : "",
        c.memberId != null ? memberName.get(c.memberId) : "",
        s?.sku ?? "",
        s?.kind ?? "",
        s?.label ?? "",
        c.name,
        c.pose,
        c.retailPriceJpy,
        imageName(c),
        c.createdAt.toISOString(),
      ]
        .map(csvField)
        .join(","),
    );
  }
  const csv = "﻿" + csvLines.join("\r\n");

  // 이미지(clean 원본)를 카탈로그 버킷에서 받아 ZIP 에 담는다. 실패한 건 스킵하고 계속.
  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (d: Buffer) => chunks.push(d));
    archive.on("warning", (e) => console.warn("[catalog export]", e));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });

  archive.append(JSON.stringify(catalogJson, null, 2), { name: "catalog.json" });
  archive.append(csv, { name: "cards.csv" });

  for (const c of cards) {
    if (!c.frontR2Key) continue;
    const cleanKey = cardCleanKey(c.frontR2Key) ?? c.frontR2Key;
    try {
      const bytes = await readObjectBytes(await fetchCatalogObject(cleanKey));
      archive.append(bytes, { name: `images/card-${c.id}-pose${c.pose}.jpg` });
    } catch (error) {
      console.warn(`[catalog export] 이미지 스킵 card=${c.id}`, error);
    }
  }

  void archive.finalize();
  const zip = await done;

  return new NextResponse(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="iroiro-catalog-${todayKstYmd()}.zip"`,
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
