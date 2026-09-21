"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Layers,
  LayoutDashboard,
  Tag,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import { AdminAccountMenu } from "./AdminAccountMenu";

// 카탈로그 셸 — 이로이로 디자인 시스템(Storybook › Patterns › Navigation)의 알약(pill) 내비를 상단에 두고
// 본문은 넓게 쓴다. 관리자(사이드바)와 구분되는 건 레이아웃이지 색·폰트가 아니다 — 토큰은 공통.
// 홈은 정확히 /catalog 일 때만 활성, 나머지는 하위 경로까지 활성.

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { label: "홈", href: "/catalog", icon: LayoutDashboard, exact: true },
  { label: "토레카", href: "/catalog/cards", icon: WalletCards },
  { label: "검수", href: "/catalog/cards?view=pending", icon: ClipboardCheck },
  { label: "시리즈", href: "/catalog/series", icon: Layers },
  { label: "종류", href: "/catalog/kinds", icon: Tag },
  { label: "그룹", href: "/catalog/teams", icon: Users },
  { label: "멤버", href: "/catalog/members", icon: User },
];

function isActive(pathname: string, search: string, item: NavItem): boolean {
  const [path, query] = item.href.split("?");
  if (item.exact) return pathname === path;
  if (query) return pathname === path && search.includes(query);
  // 같은 경로에 쿼리로 구분되는 항목(검수)이 있으면, 쿼리 없는 항목은 그 쿼리가 아닐 때만 활성
  const sibling = NAV.find((n) => n !== item && n.href.startsWith(`${path}?`));
  if (sibling && search.includes(sibling.href.split("?")[1] ?? "")) return false;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function CatalogShell({
  children,
  appName,
  isDev,
}: {
  children: React.ReactNode;
  appName: string;
  isDev: boolean;
}) {
  const pathname = usePathname();
  // useSearchParams 는 Suspense 경계를 요구하므로 window 기반으로 가볍게 읽는다(활성 표시 용도).
  const search = typeof window === "undefined" ? "" : window.location.search;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b-[3px] border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/catalog" className="flex items-center gap-2.5">
            <BrandLockup wordmarkAlt={appName} />
            <span className="hidden rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium tracking-[0.09em] text-accent sm:inline">
              TRADING CARD ARCHIVE
            </span>
            {isDev && (
              <span className="rounded-full bg-lemon px-2 py-0.5 text-[10px] font-medium text-ink">
                dev
              </span>
            )}
          </Link>
          <AdminAccountMenu />
        </div>
        <nav
          aria-label="카탈로그 메뉴"
          className="scroll-x mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2.5 sm:px-5"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, search, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
                  active ? "bg-primary/10 text-primary" : "text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="py-5 text-center text-[11px] text-muted-foreground">
        {appName} · 토레카 마스터 데이터 관리 · site admin 전용
      </footer>
    </div>
  );
}
