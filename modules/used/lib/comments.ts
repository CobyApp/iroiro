import "server-only";

import { db } from "@/lib/db";
import type { UsedComment, UsedCommentNode } from "../types";

const DELETED_BODY = "삭제된 댓글입니다";

function toComment(row: {
  id: bigint;
  listingId: bigint;
  accountId: string;
  parentId: bigint | null;
  body: string;
  deletedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
}, authorName: string): UsedComment {
  const deleted = row.deletedAt !== null;
  return {
    id: Number(row.id),
    listingId: Number(row.listingId),
    accountId: row.accountId,
    authorName,
    parentId: row.parentId === null ? null : Number(row.parentId),
    body: deleted ? DELETED_BODY : row.body,
    deleted,
    edited: row.editedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

// 매물의 공개 댓글을 1단계 스레드로 반환한다.
// 삭제된 최상위 댓글이라도 대댓글이 있으면 "삭제된 댓글입니다"로 자리를 남긴다(스레드 유지).
// 대댓글이 없는 삭제 최상위 댓글은 목록에서 제외.
export async function listUsedComments(
  listingId: number,
): Promise<UsedCommentNode[]> {
  const rows = await db.usedListingComment.findMany({
    where: { listingId: BigInt(listingId) },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.accountId))];
  const accounts = await db.account.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, displayName: true },
  });
  const nameBy = new Map(accounts.map((a) => [a.id, a.displayName ?? "회원"]));

  const parents = rows.filter((r) => r.parentId === null);
  const repliesByParent = new Map<number, typeof rows>();
  for (const r of rows) {
    if (r.parentId === null) continue;
    const key = Number(r.parentId);
    const arr = repliesByParent.get(key) ?? [];
    arr.push(r);
    repliesByParent.set(key, arr);
  }

  const nodes: UsedCommentNode[] = [];
  for (const p of parents) {
    const replies = (repliesByParent.get(Number(p.id)) ?? [])
      .filter((r) => r.deletedAt === null) // 삭제된 대댓글은 숨긴다
      .map((r) => toComment(r, nameBy.get(r.accountId) ?? "회원"));
    // 삭제된 최상위 댓글이면서 살아있는 대댓글도 없으면 스킵.
    if (p.deletedAt !== null && replies.length === 0) continue;
    nodes.push({
      ...toComment(p, nameBy.get(p.accountId) ?? "회원"),
      replies,
    });
  }
  return nodes;
}

// 매물 공개 댓글 수(삭제 제외) — 상세 헤더 등에서 단건 조회용.
export async function countUsedComments(listingId: number): Promise<number> {
  return db.usedListingComment.count({
    where: { listingId: BigInt(listingId), deletedAt: null },
  });
}
