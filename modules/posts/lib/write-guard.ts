import "server-only";

import type { Account } from "@prisma/client";
import { DomainError } from "@/lib/action-result";
import { isPostingBanned } from "@/modules/admin/lib/roles";

// 작성 제재 계정 차단 — 신고 누적 등으로 글·댓글 작성이 막힌 계정(신규 작성만 차단).
export function assertCanWrite(account: Account): void {
  if (isPostingBanned(account)) {
    throw new DomainError(
      account.postingBanReason
        ? `작성이 제한된 계정입니다: ${account.postingBanReason}`
        : "신고 누적으로 글·댓글 작성이 제한된 계정입니다",
      "posting_banned",
    );
  }
}
