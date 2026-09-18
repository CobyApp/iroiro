import "server-only";

import { db } from "@/lib/db";
import type { Banner } from "../types";
import { isBannerActiveAt } from "./active";

type BannerRow = {
  id: bigint;
  title: string;
  imageKey: string;
  linkUrl: string;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
};

function toBanner(row: BannerRow): Banner {
  return {
    id: Number(row.id),
    title: row.title,
    imageKey: row.imageKey,
    linkUrl: row.linkUrl,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    sortOrder: row.sortOrder,
  };
}

// 관리자 — 전체 배너(정렬 순서, 최신순).
export async function listBanners(): Promise<Banner[]> {
  const rows = await db.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toBanner);
}

// 공개 — 게시기간 내 활성 배너만(정렬 순서).
export async function getActiveBanners(): Promise<Banner[]> {
  const rows = await db.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  const now = new Date();
  return rows
    .filter((r) => isBannerActiveAt(r.startsAt, r.endsAt, now))
    .map(toBanner);
}

export async function getBanner(id: number): Promise<Banner | null> {
  const row = await db.banner.findUnique({ where: { id: BigInt(id) } });
  return row ? toBanner(row) : null;
}
