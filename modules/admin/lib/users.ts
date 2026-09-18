import "server-only";

import { db } from "@/lib/db";

export type AdminUserRow = {
  id: string;
  displayName: string;
  publicCode: string;
  isAdmin: boolean;
  boardRole: "member" | "moderator";
  postingBanned: boolean;
  postingBanReason: string | null;
  createdAt: string;
};

// 회원 검색 — 닉네임 부분일치 또는 #공개코드 정확일치. 탈퇴 계정 제외.
export async function listAdminUsers(q?: string): Promise<AdminUserRow[]> {
  const query = q?.trim();
  const rows = await db.account.findMany({
    where: {
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { publicCode: { equals: query } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      displayName: true,
      publicCode: true,
      isAdmin: true,
      boardRole: true,
      postingBannedAt: true,
      postingBanReason: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    publicCode: r.publicCode,
    isAdmin: r.isAdmin,
    boardRole: r.boardRole === "moderator" ? "moderator" : "member",
    postingBanned: r.postingBannedAt !== null,
    postingBanReason: r.postingBanReason,
    createdAt: r.createdAt.toISOString(),
  }));
}
