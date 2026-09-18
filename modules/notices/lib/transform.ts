import "server-only";

import type { Notice as PrismaNotice } from "@prisma/client";
import { getPublicUrl } from "@/lib/r2/presign";
import type { Notice, NoticeCategory } from "../types";

// deletedAt·created_by류는 DTO 미포함 — 공개·admin 화면 공통으로 노출 불필요.
// photos: 조회 계층이 display_order 순으로 넘긴다. 목록 계열은 생략(빈 배열) — 스펙 §조회·렌더.
export function toNotice(row: PrismaNotice, photos: { r2Key: string }[] = []): Notice {
  return {
    id: Number(row.id),
    publicCode: row.publicCode,
    category: row.category as NoticeCategory,
    title: row.title,
    body: row.body,
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    photos: photos.map((photo) => ({
      r2Key: photo.r2Key,
      url: getPublicUrl(photo.r2Key),
    })),
  };
}
