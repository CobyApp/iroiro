import type { Account } from "@prisma/client";
import { hasAdminSpace } from "./adminRoles";

// 게시판(커뮤니티) 관리자 판정 — site admin 또는 community 부분 권한 보유.
// 남의 글 관리(숨김·삭제)·공지 등록·신고 처리 권한의 단일 진실. (예전 board_role='moderator'는
// admin_roles 의 'community' 로 이관됨 — adminRoles.ts)
export function isBoardManager(account: Account | null): boolean {
  return hasAdminSpace(account, "community");
}

// 작성 제재 상태 — 신고 등으로 글·댓글 작성이 막힌 계정.
export function isPostingBanned(account: Account | null): boolean {
  // != null 로 undefined도 "정상"으로 취급 — 부분 계정 객체 방어.
  return !!account && account.postingBannedAt != null;
}
