import "server-only";

import type { Account } from "@prisma/client";
import { getCurrentAccount } from "@/modules/auth/dal";
import { hasAdminSpace, ADMIN_SPACE_LABEL, type AdminSpace } from "./adminRoles";

// 관리 공간별 Server Action 가드 — 해당 부분 권한(또는 site admin)만 통과. defense in depth.
export async function requireAdminSpace(space: AdminSpace): Promise<Account> {
  const account = await getCurrentAccount();
  if (!hasAdminSpace(account, space)) {
    throw new Error(`${ADMIN_SPACE_LABEL[space]} 권한이 필요합니다`);
  }
  return account!;
}

export const requireDeliveryManager = () => requireAdminSpace("delivery");
export const requireUsedManager = () => requireAdminSpace("used");
export const requireCatalogManager = () => requireAdminSpace("catalog");
