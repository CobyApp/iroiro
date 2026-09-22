"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DomainError,
  parseActionInput,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { requireBoardManager } from "@/modules/admin/lib/requireBoardManager";
import { ADMIN_SPACES } from "@/modules/admin/lib/adminRoles";

// 부분 관리 권한 부여·회수 — site admin 전용. 한 번에 한 권한(space)을 켜고 끈다.
// 배송·중고·커뮤니티·토레카 관리 권한은 복수로 가질 수 있다(account.admin_roles 배열).
const setAdminRoleSchema = z.object({
  accountId: z.string().uuid(),
  space: z.enum(ADMIN_SPACES),
  granted: z.boolean(),
});

export async function setAdminRole(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = parseActionInput(setAdminRoleSchema, input);
    if (data.accountId === admin.id) {
      throw new DomainError("본인 권한은 변경할 수 없습니다");
    }
    const target = await db.account.findUnique({
      where: { id: data.accountId },
      select: { deletedAt: true, adminRoles: true },
    });
    if (!target || target.deletedAt) throw new DomainError("회원을 찾을 수 없습니다");
    const current = new Set((target.adminRoles as string[]).filter((r) => ADMIN_SPACES.includes(r as never)));
    if (data.granted) current.add(data.space);
    else current.delete(data.space);
    await db.account.update({
      where: { id: data.accountId },
      // 정의된 순서로 정규화해 저장(표시 일관성).
      data: {
        adminRoles: ADMIN_SPACES.filter((s) => current.has(s)),
        updatedAt: new Date(),
      },
    });
    revalidatePath("/board/users");
  });
}

// 사이트 관리자(is_admin) 지정·해제 — site admin 전용, 최고 권한이라 신중히.
const setAdminSchema = z.object({
  accountId: z.string().uuid(),
  isAdmin: z.boolean(),
});

export async function setSiteAdmin(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = parseActionInput(setAdminSchema, input);
    // 본인 권한 변경 금지 — 실수로 자기 권한을 내려 락아웃되는 것 방지.
    if (data.accountId === admin.id) {
      throw new DomainError("본인 관리자 권한은 변경할 수 없습니다");
    }
    const target = await db.account.findUnique({
      where: { id: data.accountId },
      select: { deletedAt: true },
    });
    if (!target || target.deletedAt) throw new DomainError("회원을 찾을 수 없습니다");
    await db.account.update({
      where: { id: data.accountId },
      data: {
        isAdmin: data.isAdmin,
        // 관리자로 지정하면 작성 제재는 해제(관리자는 제재 대상이 아님 — 기존 로직과 일관).
        ...(data.isAdmin
          ? { postingBannedAt: null, postingBanReason: null }
          : {}),
        updatedAt: new Date(),
      },
    });
    revalidatePath("/board/users");
  });
}

// 작성 제재 설정·해제 — 게시판 관리자(admin/moderator)가 처리. 사유 선택.
const setBanSchema = z.object({
  accountId: z.string().uuid(),
  banned: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

export async function setPostingBan(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const manager = await requireBoardManager();
    const data = parseActionInput(setBanSchema, input);
    if (data.accountId === manager.id) {
      throw new DomainError("본인 계정은 제재할 수 없습니다");
    }
    // 관리 권한을 가진 계정은 제재 대상에서 제외(권한 오남용 방지).
    const target = await db.account.findUnique({
      where: { id: data.accountId },
      select: { isAdmin: true, adminRoles: true },
    });
    if (!target) throw new DomainError("회원을 찾을 수 없습니다");
    if (data.banned && (target.isAdmin || (target.adminRoles as string[]).length > 0)) {
      throw new DomainError("관리자·부분 관리자는 작성 제재할 수 없습니다");
    }
    await db.account.update({
      where: { id: data.accountId },
      data: {
        postingBannedAt: data.banned ? new Date() : null,
        postingBanReason: data.banned ? (data.reason ?? null) : null,
        updatedAt: new Date(),
      },
    });
    revalidatePath("/board/users");
  });
}
