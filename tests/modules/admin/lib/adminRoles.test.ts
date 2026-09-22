import { describe, expect, it } from "vitest";
import type { Account } from "@prisma/client";

import {
  ADMIN_SPACES,
  ADMIN_SPACE_HREF,
  ADMIN_SPACE_LABEL,
  adminRolesOf,
  canEnterAnyAdmin,
  hasAdminSpace,
  isAdminSpace,
  primaryAdminHref,
} from "@/modules/admin/lib/adminRoles";

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "0198aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
    email: null,
    emailVerifiedAt: null,
    phoneNumber: null,
    phoneNumberVerifiedAt: null,
    displayName: "덕후",
    publicCode: "AbCdEfG1",
    avatarKey: null,
    deletedAt: null,
    isAdmin: false,
    boardRole: "member",
    adminRoles: [],
    postingBannedAt: null,
    postingBanReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("상수 정합성", () => {
  it("모든 공간에 라벨과 진입 경로가 정의돼 있다", () => {
    for (const space of ADMIN_SPACES) {
      expect(ADMIN_SPACE_LABEL[space]).toBeTruthy();
      expect(ADMIN_SPACE_HREF[space]).toMatch(/^\//);
    }
  });

  it("진입 경로는 공간마다 유일하다", () => {
    const hrefs = ADMIN_SPACES.map((s) => ADMIN_SPACE_HREF[s]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("isAdminSpace — 값 정규화", () => {
  it("정의된 값만 공간으로 인정한다", () => {
    expect(isAdminSpace("delivery")).toBe(true);
    expect(isAdminSpace("catalog")).toBe(true);
    expect(isAdminSpace("superuser")).toBe(false);
    expect(isAdminSpace("")).toBe(false);
  });
});

describe("adminRolesOf — 부분 권한 집합", () => {
  it("알 수 없는 값은 버린다", () => {
    const roles = adminRolesOf(account({ adminRoles: ["delivery", "bogus", "catalog"] }));
    expect([...roles].sort()).toEqual(["catalog", "delivery"]);
  });

  it("null 계정은 빈 집합", () => {
    expect(adminRolesOf(null).size).toBe(0);
  });

  it("권한 없는 계정은 빈 집합", () => {
    expect(adminRolesOf(account()).size).toBe(0);
  });
});

describe("hasAdminSpace — 공간 진입 판정", () => {
  it("해당 부분 권한을 가지면 그 공간에 들어갈 수 있다", () => {
    const a = account({ adminRoles: ["community"] });
    expect(hasAdminSpace(a, "community")).toBe(true);
    expect(hasAdminSpace(a, "catalog")).toBe(false);
  });

  it("site admin 은 모든 공간에 들어갈 수 있다", () => {
    const a = account({ isAdmin: true });
    for (const space of ADMIN_SPACES) {
      expect(hasAdminSpace(a, space)).toBe(true);
    }
  });

  it("null 계정은 어느 공간에도 못 들어간다", () => {
    expect(hasAdminSpace(null, "delivery")).toBe(false);
  });
});

describe("canEnterAnyAdmin — 관리 진입점 유무", () => {
  it("부분 권한이 하나라도 있으면 true", () => {
    expect(canEnterAnyAdmin(account({ adminRoles: ["used"] }))).toBe(true);
  });

  it("site admin 은 true", () => {
    expect(canEnterAnyAdmin(account({ isAdmin: true }))).toBe(true);
  });

  it("권한 없는 일반 계정·null 은 false", () => {
    expect(canEnterAnyAdmin(account())).toBe(false);
    expect(canEnterAnyAdmin(null)).toBe(false);
  });
});

describe("primaryAdminHref — 최초 진입 홈", () => {
  it("site admin 은 메인 관리자로", () => {
    expect(primaryAdminHref(account({ isAdmin: true }))).toBe("/admin");
  });

  it("부분 권한자는 ADMIN_SPACES 순서상 가진 첫 공간으로", () => {
    // ADMIN_SPACES 순서: delivery, used, community, catalog
    expect(primaryAdminHref(account({ adminRoles: ["catalog", "community"] }))).toBe("/board");
    expect(primaryAdminHref(account({ adminRoles: ["catalog"] }))).toBe("/catalog");
  });

  it("권한 없는 계정·null 은 null", () => {
    expect(primaryAdminHref(account())).toBeNull();
    expect(primaryAdminHref(null)).toBeNull();
  });
});
