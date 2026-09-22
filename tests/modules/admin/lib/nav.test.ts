import { describe, expect, it } from "vitest";
import {
  ADMIN_SECTIONS,
  BOARD_SECTIONS,
  CATALOG_SECTIONS,
  DELIVERY_SECTIONS,
  isNavItemActive,
  visibleSections,
  type NavItem,
  type NavSection,
  type NavViewer,
} from "@/modules/admin/lib/nav";
import type { AdminSpace } from "@/modules/admin/lib/adminRoles";

const item = (over: Partial<NavItem> & Pick<NavItem, "key" | "href">): NavItem => ({
  label: over.key,
  role: "siteAdmin",
  ...over,
});

const viewer = (isSiteAdmin: boolean, spaces: AdminSpace[] = []): NavViewer => ({
  isSiteAdmin,
  spaces: new Set(spaces),
});

const SECTIONS: NavSection[] = [
  { items: [item({ key: "dash", href: "/admin", role: "siteAdmin" })] },
  {
    title: "게시판",
    items: [
      item({ key: "posts", href: "/board/posts", role: "community", matchPrefix: "/board/posts" }),
      item({ key: "users", href: "/board/users", role: "siteAdmin", matchPrefix: "/board/users" }),
    ],
  },
  {
    title: "혼합",
    items: [
      item({ key: "notices", href: "/board/notices", role: "community" }),
      item({ key: "cards", href: "/catalog/cards", role: "catalog" }),
      item({ key: "policy", href: "/delivery", role: "delivery" }),
    ],
  },
];

describe("visibleSections", () => {
  it("site admin sees every section and item unchanged", () => {
    expect(visibleSections(SECTIONS, viewer(true))).toEqual(SECTIONS);
  });

  it("community-only manager sees only community items and drops emptied sections", () => {
    const result = visibleSections(SECTIONS, viewer(false, ["community"]));
    expect(result.map((s) => s.title)).toEqual(["게시판", "혼합"]);
    expect(result[0].items.map((i) => i.key)).toEqual(["posts"]); // users(siteAdmin) 제외
    expect(result[1].items.map((i) => i.key)).toEqual(["notices"]);
  });

  it("catalog-only manager sees only the catalog item", () => {
    const result = visibleSections(SECTIONS, viewer(false, ["catalog"]));
    expect(result.flatMap((s) => s.items.map((i) => i.key))).toEqual(["cards"]);
  });

  it("someone with no roles sees nothing", () => {
    expect(visibleSections(SECTIONS, viewer(false))).toEqual([]);
  });

  it.each([
    ["community", viewer(false, ["community"]), true],
    ["catalog", viewer(false, ["community"]), false],
    ["siteAdmin", viewer(false, ["community"]), false],
    ["delivery", viewer(false, ["delivery"]), true],
    ["catalog", viewer(true), true], // site admin covers every space
    ["siteAdmin", viewer(true), true],
  ] as const)("role %s with %o → visible=%s", (role, v, visible) => {
    const result = visibleSections([{ items: [item({ key: "x", href: "/x", role })] }], v);
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

describe("실제 섹션 정의", () => {
  it("메인 관리자(/admin)는 site admin 전용 — 부분 권한자는 메뉴가 없다", () => {
    expect(visibleSections(ADMIN_SECTIONS, viewer(false, ["community", "catalog", "delivery"]))).toEqual([]);
  });

  it("메인 관리자는 네 공간으로 가는 바로가기를 갖되 역방향 링크는 없다", () => {
    const admin = ADMIN_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(admin).toContain("/delivery");
    expect(admin).toContain("/board");
    expect(admin).toContain("/catalog");
    for (const sections of [BOARD_SECTIONS, CATALOG_SECTIONS, DELIVERY_SECTIONS]) {
      expect(sections.flatMap((s) => s.items.map((i) => i.href))).not.toContain("/admin");
    }
  });

  it("각 공간은 대응 부분 권한자에게 열린다", () => {
    expect(visibleSections(BOARD_SECTIONS, viewer(false, ["community"])).length).toBeGreaterThan(0);
    expect(visibleSections(CATALOG_SECTIONS, viewer(false, ["catalog"])).length).toBeGreaterThan(0);
    expect(visibleSections(DELIVERY_SECTIONS, viewer(false, ["delivery"])).length).toBeGreaterThan(0);
    // 커뮤니티 권한만으로는 카탈로그·배송 공간 메뉴가 안 보인다.
    expect(visibleSections(CATALOG_SECTIONS, viewer(false, ["community"]))).toEqual([]);
    expect(visibleSections(DELIVERY_SECTIONS, viewer(false, ["community"]))).toEqual([]);
  });

  it("게시판 회원·등급은 site admin 전용", () => {
    const board = visibleSections(BOARD_SECTIONS, viewer(false, ["community"]));
    expect(board.flatMap((s) => s.items.map((i) => i.href))).not.toContain("/board/users");
    expect(
      visibleSections(BOARD_SECTIONS, viewer(true)).flatMap((s) => s.items.map((i) => i.href)),
    ).toContain("/board/users");
  });

  it("item keys are unique within each section list", () => {
    for (const sections of [ADMIN_SECTIONS, BOARD_SECTIONS, CATALOG_SECTIONS, DELIVERY_SECTIONS]) {
      const keys = sections.flatMap((s) => s.items.map((i) => i.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
