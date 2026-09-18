import "server-only";

import { db } from "@/lib/db";
import { toNotice } from "./transform";
import type { Notice } from "../types";

// 공지 정렬 단일 진실 — 고정 우선 → 최신순 → id 안정화 (스펙 §데이터 모델)
const NOTICE_ORDER = [
  { isPinned: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

export async function listNotices(): Promise<Notice[]> {
  const rows = await db.notice.findMany({
    where: { deletedAt: null },
    orderBy: NOTICE_ORDER,
  });
  // 콜백을 감싸 map의 index가 photos 인자로 새는 것을 막는다 — 목록은 사진 미조회.
  return rows.map((row) => toNotice(row));
}

export async function listHomeNotices(limit = 2): Promise<Notice[]> {
  const rows = await db.notice.findMany({
    where: { deletedAt: null },
    orderBy: NOTICE_ORDER,
    take: limit,
  });
  // 콜백을 감싸 map의 index가 photos 인자로 새는 것을 막는다 — 목록은 사진 미조회.
  return rows.map((row) => toNotice(row));
}

// 상세 계열만 사진 포함 — 목록은 미조회(스펙 §조회·렌더 YAGNI). display_order 순.
async function fetchPhotos(noticeId: bigint) {
  return db.noticePhoto.findMany({
    where: { noticeId },
    orderBy: { displayOrder: "asc" },
  });
}

export async function getNoticeByPublicCode(
  code: string,
): Promise<Notice | null> {
  const row = await db.notice.findFirst({
    where: { publicCode: code, deletedAt: null },
  });
  if (!row) return null;
  return toNotice(row, await fetchPhotos(row.id));
}

export async function getNoticeById(id: number): Promise<Notice | null> {
  const row = await db.notice.findFirst({
    where: { id: BigInt(id), deletedAt: null },
  });
  if (!row) return null;
  return toNotice(row, await fetchPhotos(row.id));
}
