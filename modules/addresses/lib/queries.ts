import "server-only";

import { db } from "@/lib/db";
import type { AccountAddress } from "../types";
import { toAccountAddress } from "./transform";

// 내 주소록 — 기본 배송지 먼저, 이후 최신순.
export async function listAddresses(
  accountId: string,
): Promise<AccountAddress[]> {
  const rows = await db.accountAddress.findMany({
    where: { accountId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toAccountAddress);
}

// 기본 배송지 — 체크아웃 프리필용.
export async function getDefaultAddress(
  accountId: string,
): Promise<AccountAddress | null> {
  const row = await db.accountAddress.findFirst({
    where: { accountId, isDefault: true },
  });
  return row ? toAccountAddress(row) : null;
}
