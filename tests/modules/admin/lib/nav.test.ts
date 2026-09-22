import { describe, expect, it } from "vitest";
import {
  ADMIN_SECTIONS,
  BOARD_SECTIONS,
  CATALOG_SECTIONS,
  isNavItemActive,
  visibleSections,
  type NavItem,
  type NavSection,
} from "@/modules/admin/lib/nav";

const item = (over: Partial<NavItem> & Pick<NavItem, "key" | "href">): NavItem => ({
  label: over.key,
  role: "admin",
  ...over,
});

const SECTIONS: NavSection[] = [
  { items: [item({ key: "dash", href: "/admin", role: "admin" })] },
  {
    title: "커뮤니티",
    items: [
      item({ key: "posts", href: "/admin/posts", role: "boardManager", matchPrefix: "/admin/posts" }),
      item({ key: "users", href: "/admin/users", role: "boardManager", matchPrefix: "/admin/users" }),
    ],
  },
  {
    title: "혼합",
    items: [
      item({ key: "notices", href: "/admin/notices", role: "boardManager" }),
      item({ key: "banners", href: "/admin/banners", role: "admin" }),
      item({ key: "catalog", href: "/catalog", role: "siteAdmin" }),
    ],
  },
];

describe("visibleSections", () => {
  it("site admin sees every section and item unchanged", () => {
    const result = visibleSections(SECTIONS, { isSiteAdmin: true, isBoardManager: true });
    expect(result).toEqual(SECTIONS);
  });

  it("board manager (non-admin) sees only boardManager items and drops emptied sections", () => {
    const result = visibleSections(SECTIONS, { isSiteAdmin: false, isBoardManager: true });
    expect(result.map((s) => s.title)).toEqual(["커뮤니티", "혼합"]);
    expect(result[0].items.map((i) => i.key)).toEqual(["posts", "users"]);
    expect(result[1].items.map((i) => i.key)).toEqual(["notices"]);
  });

  it("someone with neither role sees nothing", () => {
    expect(visibleSections(SECTIONS, { isSiteAdmin: false, isBoardManager: false })).toEqual([]);
  });

  it.each([
    ["boardManager", { isSiteAdmin: false, isBoardManager: true }, true],
    ["admin", { isSiteAdmin: false, isBoardManager: true }, false],
    ["siteAdmin", { isSiteAdmin: false, isBoardManager: true }, false],
    ["admin", { isSiteAdmin: true, isBoardManager: true }, true],
    ["siteAdmin", { isSiteAdmin: true, isBoardManager: true }, true],
  ] as const)("role %s with %o → visible=%s", (role, viewer, visible) => {
    const result = visibleSections([{ items: [item({ key: "x", href: "/x", role })] }], viewer);
    expect(result.length > 0).toBe(visible);
  });
});

describe("isNavItemActive", () => {
  it("matches exactly when no matchPrefix is given", () => {
    const dash = item({ key: "dash", href: "/admin" });
    expect(isNavItemActive("/admin", dash)).toBe(true);
    expect(isNavItemActive("/admin/orders", dash)).toBe(false);
  });

  it("matches the prefix itself and its sub-paths, not sibling prefixes", () => {
    const orders = item({ key: "orders", href: "/admin/orders", matchPrefix: "/admin/orders" });
    expect(isNavItemActive("/admin/orders", orders)).toBe(true);
    expect(isNavItemActive("/admin/orders/123", orders)).toBe(true);
    expect(isNavItemActive("/admin/orders-archive", orders)).toBe(false);
    expect(isNavItemActive("/admin", orders)).toBe(false);
  });
});

describe("ADMIN_SECTIONS / BOARD_SECTIONS / CATALOG_SECTIONS", () => {
  it("게시판 관리는 /admin 이 아니라 BOARD_SECTIONS 로 분리됐다 — /admin 에는 커뮤니티 메뉴가 없다", () => {
    const adminHrefs = ADMIN_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(adminHrefs).not.toContain("/board/posts");
    expect(adminHrefs).not.toContain("/board/notices");
    // moderator(비-admin)는 운영 관리자(/admin)에서 볼 수 있는 메뉴가 없다 → /board 로 유도.
    expect(visibleSections(ADMIN_SECTIONS, { isSiteAdmin: false, isBoardManager: true })).toEqual([]);
  });

  it("board manager(비-admin)는 게시판 홈·게시판/신고·공지는 보되 회원·등급(admin 전용)은 못 본다", () => {
    const result = visibleSections(BOARD_SECTIONS, { isSiteAdmin: false, isBoardManager: true });
    const hrefs = result.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/board");
    expect(hrefs).toContain("/board/posts");
    expect(hrefs).toContain("/board/notices");
    expect(hrefs).not.toContain("/board/users"); // 회원·등급 = site admin 전용
    expect(hrefs).not.toContain("/admin"); // 바로가기(siteAdmin)도 안 보임
  });

  it("site admin 은 BOARD_SECTIONS 전체(회원·등급·바로가기 포함)를 본다", () => {
    const hrefs = visibleSections(BOARD_SECTIONS, { isSiteAdmin: true, isBoardManager: true })
      .flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/board/users");
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/catalog");
  });

  it("세 공간이 서로 바로가기로 이어진다", () => {
    const admin = ADMIN_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const board = BOARD_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const catalog = CATALOG_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(admin).toContain("/catalog");
    expect(admin).toContain("/board");
    expect(board).toContain("/admin");
    expect(catalog).toContain("/admin");
  });

  it("item keys are unique within each section list", () => {
    for (const sections of [ADMIN_SECTIONS, BOARD_SECTIONS, CATALOG_SECTIONS]) {
      const keys = sections.flatMap((s) => s.items.map((i) => i.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
