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
import { BrandMark } from "@/modules/ui/components/BrandMark";
import { AdminAccountMenu } from "./AdminAccountMenu";

// 카탈로그 셸 — 관리자 사이드바와 달리 **상단 내비 + 넓은 본문**. 토레카 마스터 데이터를
// "도감"처럼 훑는 화면이라 좌우 폭을 다 쓰고, 섹션 이동은 헤더 아래 탭 줄로 한다.
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
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/catalog" className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold tracking-tight text-foreground">{appName}</span>
              <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
                TRADING CARD ARCHIVE
              </span>
            </span>
            {isDev && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                dev
              </span>
            )}
          </Link>
          <AdminAccountMenu />
        </div>
        <nav
          aria-label="카탈로그 메뉴"
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4 scroll-x"
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
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-border py-4 text-center text-[11px] text-muted-foreground">
        {appName} · 토레카 마스터 데이터 관리 · site admin 전용
      </footer>
    </div>
  );
}
