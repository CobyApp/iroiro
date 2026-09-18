import "server-only";

import { db } from "@/lib/db";

export type Favorites = { teamIds: number[]; memberIds: number[] };

/** 계정의 최애 그룹·멤버 id 목록. */
export async function getFavorites(accountId: string): Promise<Favorites> {
  const rows = await db.accountFavorite.findMany({
    where: { accountId },
    select: { kind: true, targetId: true },
  });
  return {
    teamIds: rows
      .filter((r) => r.kind === "team")
      .map((r) => Number(r.targetId)),
    memberIds: rows
      .filter((r) => r.kind === "member")
      .map((r) => Number(r.targetId)),
  };
}

/** 최애 전량 교체 저장 — 트랜잭션으로 delete → createMany. */
export async function replaceFavorites(
  accountId: string,
  favorites: Favorites,
): Promise<void> {
  const teamIds = Array.from(new Set(favorites.teamIds));
  const memberIds = Array.from(new Set(favorites.memberIds));
  await db.$transaction(async (tx) => {
    await tx.accountFavorite.deleteMany({ where: { accountId } });
    const data = [
      ...teamIds.map((id) => ({
        accountId,
        kind: "team",
        targetId: BigInt(id),
      })),
      ...memberIds.map((id) => ({
        accountId,
        kind: "member",
        targetId: BigInt(id),
      })),
    ];
    if (data.length > 0) await tx.accountFavorite.createMany({ data });
  });
}
