"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { BrandMark } from "@/modules/ui/components/BrandMark";
import {
  ADMIN_SECTIONS,
  BOARD_SECTIONS,
  CATALOG_SECTIONS,
  DELIVERY_SECTIONS,
  MARKET_SECTIONS,
  visibleSections,
  type NavSection,
} from "../lib/nav";
import type { AdminSpace } from "../lib/adminRoles";
import { AdminSidebar } from "./AdminSidebar";
import { AdminAccountMenu } from "./AdminAccountMenu";
import { AdminCommandPalette, type CommandItem } from "./AdminCommandPalette";

export type AdminShellScope = "admin" | "catalog" | "board" | "delivery" | "market";

const SCOPE: Record<
  AdminShellScope,
  { title: string; badge: string; badgeClassName: string; homeHref: string; sections: NavSection[]; navLabel: string }
> = {
  admin: {
    title: "통합 관리",
    badge: "ADMIN",
    badgeClassName: "bg-muted text-muted-foreground",
    homeHref: "/admin",
    sections: ADMIN_SECTIONS,
    navLabel: "통합 관리 메뉴",
  },
  catalog: {
    title: "토레카 관리",
    badge: "TRADING CARD ARCHIVE",
    badgeClassName: "bg-accent/15 tracking-[0.09em] text-accent",
    homeHref: "/admin/catalog",
    sections: CATALOG_SECTIONS,
    navLabel: "토레카 관리 메뉴",
  },
  board: {
    title: "커뮤니티 관리",
    badge: "COMMUNITY",
    badgeClassName: "bg-mint/40 text-ink",
    homeHref: "/admin/posts",
    sections: BOARD_SECTIONS,
    navLabel: "커뮤니티 관리 메뉴",
  },
  delivery: {
    title: "스토어 관리",
    badge: "STORE",
    badgeClassName: "bg-cyan/25 text-ink",
    homeHref: "/admin/store",
    sections: DELIVERY_SECTIONS,
    navLabel: "스토어 관리 메뉴",
  },
  market: {
    title: "중고거래 관리",
    badge: "MARKETPLACE",
    badgeClassName: "bg-lemon/50 text-ink",
    homeHref: "/admin/used",
    sections: MARKET_SECTIONS,
    navLabel: "중고거래 관리 메뉴",
  },
};

// 관리자(/admin)·카탈로그(/admin/catalog) 공용 셸 — 상단 고정 헤더 + 사이드바(데스크톱 접기 / 모바일 드로어) + 본문.
// 스크롤은 문서 스크롤(min-h-dvh) 하나만 쓴다 — 내부 overflow 컨테이너를 두지 않아 모바일에서
// 주소창 축소·safe-area·키보드가 자연스럽게 동작한다. 토스트는 여기서 한 번만 마운트한다.
export function AdminShell({
  children,
  scope = "admin",
  appName,
  isDev = false,
  isSiteAdmin = true,
  spaces = [],
}: {
  children: React.ReactNode;
  scope?: AdminShellScope;
  /** 워드마크 alt — 설치형 앱 이름(dev 접미 포함). */
  appName?: string;
  /** dev 배포 표시 배지. */
  isDev?: boolean;
  isSiteAdmin?: boolean;
  /** 보유한 부분 관리 권한(site admin 이 아니면 사이드바 메뉴 필터에 쓴다). */
  spaces?: AdminSpace[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const config = SCOPE[scope];
  const viewer = { isSiteAdmin, spaces: new Set(spaces) };

  // 명령 팔레트(⌘K) 항목 — 접근 가능한 모든 관리 공간의 메뉴를 평탄화해 어디로든 즉시 이동.
  const paletteItems: CommandItem[] = (Object.keys(SCOPE) as AdminShellScope[]).flatMap((s) => {
    const cfg = SCOPE[s];
    return visibleSections(cfg.sections, viewer).flatMap((section) =>
      section.items.map((item) => ({
        key: item.key,
        label: item.label,
        href: item.href,
        scope: cfg.title,
        scopeKey: s,
        scopeBadge: cfg.badge,
        scopeBadgeClassName: cfg.badgeClassName,
        group: section.title,
      })),
    );
  });

  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      style={{ "--admin-header-h": "calc(3.5rem + 3px + env(safe-area-inset-top))" } as React.CSSProperties}
    >
      <header className="sticky top-0 z-40 border-b-[3px] border-border bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="메뉴 열기"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              href={config.homeHref}
              aria-label={`${appName ?? config.title} 홈`}
              className="flex min-w-0 items-center gap-2"
            >
              <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" preload />
              {/* 스코프 이름을 항상 노출 — 모바일에서 메인 사이트와 구분된다. */}
              <span className="truncate font-display text-lg text-foreground">
                {config.title}
              </span>
              {isDev && (
                <span className="shrink-0 rounded-full bg-lemon px-2 py-0.5 text-[10px] font-medium text-ink">
                  dev
                </span>
              )}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <AdminCommandPalette items={paletteItems} />
            <AdminAccountMenu />
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-stretch">
        <AdminSidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sections={config.sections}
          viewer={viewer}
          ariaLabel={config.navLabel}
          scopeKey={scope}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}
