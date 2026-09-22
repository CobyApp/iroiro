import "server-only";

import { db } from "@/lib/db";
import { type AdminSpace, isAdminSpace } from "./adminRoles";

export type AdminUserRow = {
  id: string;
  displayName: string;
  publicCode: string;
  isAdmin: boolean;
  /** 보유한 부분 관리 권한 — 배송·중고·커뮤니티·토레카. */
  adminRoles: AdminSpace[];
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
      adminRoles: true,
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
    adminRoles: (r.adminRoles as string[]).filter(isAdminSpace),
    postingBanned: r.postingBannedAt !== null,
    postingBanReason: r.postingBanReason,
    createdAt: r.createdAt.toISOString(),
  }));
}
