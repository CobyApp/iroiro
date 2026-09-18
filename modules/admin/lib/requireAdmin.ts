import "server-only";

import type { Account } from "@prisma/client";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "./isAdmin";

// Server Action 진입 시 호출하는 admin 가드 — defense in depth.
// middleware(Basic Auth 외곽)·admin layout 가드와 별개로, 각 mutation이 자체 세션과
// 관리자 권한을 직접 재검증한다 (Server Action은 공개 엔드포인트와 같은 보안 기준).
// 검증된 admin 계정을 반환하므로 작성자 스탬프(created_by 등)에 그대로 쓸 수 있다.
export async function requireAdmin(): Promise<Account> {
  const account = await getCurrentAccount();
  if (!account || !isAdmin(account)) {
    throw new Error("관리자 권한이 필요합니다");
  }
  return account;
}
