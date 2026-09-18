import { describe, expect, it } from "vitest";
import type { Account } from "@prisma/client";

import { isAdmin } from "@/modules/admin/lib/isAdmin";

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
    postingBannedAt: null,
    postingBanReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("isAdmin — account.is_admin 단일 진실", () => {
  it("is_admin=true 계정만 관리자다", () => {
    expect(isAdmin(account({ isAdmin: true }))).toBe(true);
  });

  it("일반 계정(is_admin=false)은 관리자가 아니다", () => {
    expect(isAdmin(account())).toBe(false);
  });

  it("세션 없음(null)은 관리자가 아니다", () => {
    expect(isAdmin(null)).toBe(false);
  });
});
