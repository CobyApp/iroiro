import "server-only";

import type { Account } from "@prisma/client";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isBoardManager } from "./roles";

// 게시판 관리 Server Action 가드 — admin 또는 moderator 허용(defense in depth).
// requireAdmin과 동형이되 게시판 관리 권한(공지·신고·남의 글 관리)까지 포함한다.
export async function requireBoardManager(): Promise<Account> {
  const account = await getCurrentAccount();
  if (!isBoardManager(account)) {
    throw new Error("게시판 관리 권한이 필요합니다");
  }
  return account!;
}
