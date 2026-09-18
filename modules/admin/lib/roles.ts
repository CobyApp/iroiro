import type { Account } from "@prisma/client";
import { isAdmin } from "./isAdmin";

// 게시판 관리자 판정 — site admin(is_admin)은 상위 권한으로 moderator를 포함한다.
// 남의 글 관리(숨김·삭제)·공지 등록·신고 처리 권한의 단일 진실.
export function isBoardManager(account: Account | null): boolean {
  return !!account && (isAdmin(account) || account.boardRole === "moderator");
}

// 작성 제재 상태 — 신고 등으로 글·댓글 작성이 막힌 계정.
export function isPostingBanned(account: Account | null): boolean {
  // != null 로 undefined도 "정상"으로 취급 — 부분 계정 객체 방어.
  return !!account && account.postingBannedAt != null;
}
