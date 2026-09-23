"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TAB_DEFS, isTabActive } from "./mobile-tabs";
import { SHOP_NAVIGATION_ICONS } from "./shop-navigation-icons";

// 데스크톱 주요 메뉴 — 모바일 하단 탭과 동일한 4개(둘러보기·중고거래·커뮤니티·마이).
// 오른쪽 유틸 아이콘(찜·장바구니·알림)과는 구분선으로 나뉜다(레이아웃).
export function DesktopNavLinks() {
  const pathname = usePathname();
  const links = TAB_DEFS;

  return (
    <nav className="flex items-center gap-0.5" aria-label="주요 메뉴">
      {links.map((tab) => {
        const active = isTabActive(tab.key, pathname);
        const Icon = SHOP_NAVIGATION_ICONS[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
              active ? "bg-primary/10 text-primary" : "text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
