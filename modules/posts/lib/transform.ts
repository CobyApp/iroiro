import "server-only";
import type { Post as PrismaPost, PostComment as PrismaComment } from "@prisma/client";
import type { Post, PostCardRef, PostComment, PostTopic } from "../types";
import { postThumbnailUrl } from "./post-media";

// 작성자 표시 정보 — account를 라이브로 읽은 값(닉네임 변경이 전 글에 즉시 반영, code는 불변).
// 행에 스냅샷 컬럼이 없으므로 조회 계층이 account 배치 조회로 채워 넘긴다.
export type AuthorInfo = { name: string; code: string };

// toPost 부가 컨텍스트 — 조회 계층이 배치로 채워 넘기는 표시 정보(태그명·카드·대표 사진).
export type PostEnrich = {
  photoCount?: number;
  thumbnailPhotoId?: number | null;
  teamName?: string | null;
  memberName?: string | null;
  card?: PostCardRef | null;
};

// FK 없는 스키마의 참조 깨짐 대비 표시 폴백 — 무결성 오류가 화면을 깨뜨리지 않게 한다.
// (account는 soft delete뿐이고 app 롤에 DELETE 권한도 없어 정상 경로에선 도달하지 않는다.)
const UNKNOWN_AUTHOR: AuthorInfo = { name: "(알 수 없음)", code: "-" };
const authorOf = (authors: Map<string, AuthorInfo>, accountId: string): AuthorInfo =>
  authors.get(accountId) ?? UNKNOWN_AUTHOR;

export function toPost(
  row: PrismaPost,
  authors: Map<string, AuthorInfo>,
  commentCount: number,
  enrich: PostEnrich = {},
): Post {
  const author = authorOf(authors, row.accountId);
  const teamId = row.teamId !== null ? Number(row.teamId) : null;
  const memberId = row.memberId !== null ? Number(row.memberId) : null;
  return {
    id: Number(row.id),
    publicCode: row.publicCode,
    topic: row.topic as PostTopic,
    title: row.title,
    body: row.body,
    authorName: author.name,
    authorCode: author.code,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt !== null ? row.editedAt.toISOString() : null,
    photoCount: enrich.photoCount ?? 0,
    commentCount,
    tag: {
      teamId,
      teamName: enrich.teamName ?? null,
      memberId,
      memberName: enrich.memberName ?? null,
    },
    event:
      row.eventStartsAt !== null
        ? {
            startsAt: row.eventStartsAt.toISOString(),
            endsAt: row.eventEndsAt !== null ? row.eventEndsAt.toISOString() : null,
            place: row.eventPlace,
          }
        : null,
    link: row.linkUrl !== null ? { url: row.linkUrl, label: row.linkLabel } : null,
    card: enrich.card ?? null,
    thumbnailUrl:
      enrich.thumbnailPhotoId != null ? postThumbnailUrl(enrich.thumbnailPhotoId) : null,
  };
}

// 댓글 1건 → DTO. 마스킹 규칙:
//   - deleted가 hidden보다 우선(삭제면 본인이라도 본문 비노출)
//   - 본문·사유는 status === "hidden" && 본인일 때만 예외 노출
// capability는 서버 계산 — UI는 이 값만 사용, mutation은 소유권 재검증(2중).
function toComment(
  row: PrismaComment,
  viewerAccountId: string | null,
  authors: Map<string, AuthorInfo>,
): PostComment {
  const isOwner = viewerAccountId !== null && row.accountId === viewerAccountId;
  const status = row.deletedAt !== null ? "deleted" : row.hiddenAt !== null ? "hidden" : "visible";
  const ownHidden = status === "hidden" && isOwner;
  const author = authorOf(authors, row.accountId);
  return {
    id: Number(row.id),
    parentId: row.parentId !== null ? Number(row.parentId) : null,
    authorName: author.name,
    authorCode: author.code,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt !== null ? row.editedAt.toISOString() : null,
    status,
    body: status === "visible" || ownHidden ? row.body : null,
    hiddenReason: ownHidden ? row.hiddenReason : null,
    canEdit: isOwner && status === "visible",
    canDelete: isOwner && status !== "deleted", // 숨김 댓글은 삭제만 허용
    canReply: viewerAccountId !== null && status === "visible" && row.parentId === null,
    canReport: viewerAccountId !== null && !isOwner && status === "visible",
    replies: [],
  };
}

// 평면 rows → 2단 트리. created_at ASC, id ASC(동시각 tiebreaker).
// 리프 필터: 노출하지 않을 댓글(삭제·타인 숨김)은 ① 답글(항상 리프)이면 제거,
// ② 최상위는 답글이 남아 있을 때만 플레이스홀더로 유지(트리 붕괴 방지).
// 본인 숨김(hiddenReason 노출)은 리프여도 유지 — 작성자 통보 경로.
export function buildCommentTree(
  rows: PrismaComment[],
  viewerAccountId: string | null,
  authors: Map<string, AuthorInfo>,
): PostComment[] {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id - b.id),
  );
  const dtoById = new Map<number, PostComment>();
  const roots: PostComment[] = [];
  for (const row of sorted) {
    const dto = toComment(row, viewerAccountId, authors);
    dtoById.set(dto.id, dto);
    if (dto.parentId === null) roots.push(dto);
    else dtoById.get(dto.parentId)?.replies.push(dto);
  }
  const keep = (c: PostComment) => c.status === "visible" || c.hiddenReason !== null;
  for (const root of roots) {
    root.replies = root.replies.filter(keep); // 답글 리프 — 삭제·타인 숨김 제거
  }
  return roots.filter((c) => keep(c) || c.replies.length > 0);
}
