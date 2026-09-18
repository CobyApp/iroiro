import type { Account } from "@prisma/client";

// 관리자 판정 단일 진실 (룰 3) — account.is_admin 컬럼 기반.
// is_admin 부여는 pre-launch 수동 운영: UPDATE account SET is_admin = TRUE WHERE id = ...
export function isAdmin(account: Account | null): boolean {
  return account?.isAdmin === true;
}
