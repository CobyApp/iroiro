import type { Account } from "@prisma/client";
import { isAdmin } from "./isAdmin";

// 부분 관리 권한 모델 — 계정은 아래 권한을 복수로 가질 수 있고, site admin(is_admin)은 전부 암묵 보유.
// 각 관리 공간(배송·중고·커뮤니티·카탈로그)은 대응 권한이 있는 계정만 들어갈 수 있다.
// 권한 부여·회수는 메인 운영 관리자(/admin) 회원·등급 화면에서 한다.

export const ADMIN_SPACES = ["delivery", "used", "community", "catalog"] as const;
export type AdminSpace = (typeof ADMIN_SPACES)[number];

export const ADMIN_SPACE_LABEL: Record<AdminSpace, string> = {
  delivery: "스토어 관리",
  used: "중고거래 관리",
  community: "커뮤니티 관리",
  catalog: "토레카 관리",
};

// 각 공간의 진입 경로 — 메인 관리자 바로가기·리다이렉트에 쓴다.
export const ADMIN_SPACE_HREF: Record<AdminSpace, string> = {
  delivery: "/delivery",
  used: "/market",
  community: "/board",
  catalog: "/catalog",
};

export function isAdminSpace(value: string): value is AdminSpace {
  return (ADMIN_SPACES as readonly string[]).includes(value);
}

// 계정이 가진 부분 권한 집합(정규화) — 알 수 없는 값은 버린다.
export function adminRolesOf(account: Account | null): Set<AdminSpace> {
  const raw = (account?.adminRoles ?? []) as string[];
  return new Set(raw.filter(isAdminSpace));
}

// 이 공간에 들어갈 수 있는가 — site admin 이거나 해당 권한 보유.
export function hasAdminSpace(account: Account | null, space: AdminSpace): boolean {
  return !!account && (isAdmin(account) || adminRolesOf(account).has(space));
}

// 어느 관리 공간이든 하나라도 들어갈 수 있는가(로그인 후 진입점 판단용).
export function canEnterAnyAdmin(account: Account | null): boolean {
  return !!account && (isAdmin(account) || adminRolesOf(account).size > 0);
}

// 로그인 계정이 처음 가야 할 관리 홈 — site admin 은 메인, 아니면 가진 권한의 첫 공간.
export function primaryAdminHref(account: Account | null): string | null {
  if (!account) return null;
  if (isAdmin(account)) return "/admin";
  for (const space of ADMIN_SPACES) {
    if (adminRolesOf(account).has(space)) return ADMIN_SPACE_HREF[space];
  }
  return null;
}
