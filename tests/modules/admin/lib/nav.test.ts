import { describe, expect, it } from "vitest";
import {
  ADMIN_SECTIONS,
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

describe("ADMIN_SECTIONS / CATALOG_SECTIONS", () => {
  it("a non-admin board manager gets only the 커뮤니티 section, without the dashboard", () => {
    const result = visibleSections(ADMIN_SECTIONS, { isSiteAdmin: false, isBoardManager: true });
    expect(result.map((s) => s.title)).toEqual(["커뮤니티"]);
    expect(result.flatMap((s) => s.items.map((i) => i.href))).not.toContain("/admin");
  });

  it("admin sections link across to the catalog and vice versa, with no 검수 entry", () => {
    const adminHrefs = ADMIN_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const catalogHrefs = CATALOG_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(adminHrefs).toContain("/catalog");
    expect(catalogHrefs).toContain("/admin");
    expect(catalogHrefs.some((h) => h.includes("view=pending"))).toBe(false);
  });

  it("item keys are unique within each section list", () => {
    for (const sections of [ADMIN_SECTIONS, CATALOG_SECTIONS]) {
      const keys = sections.flatMap((s) => s.items.map((i) => i.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
