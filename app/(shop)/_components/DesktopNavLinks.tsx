"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isTabActive, visibleTabs } from "./mobile-tabs";
import { SHOP_NAVIGATION_ICONS } from "./shop-navigation-icons";

// 데스크톱 주요 메뉴 — 모바일과 같은 탭 구조(마이 제외).
// 중고거래 탭은 전역 설정이 켜져 있을 때만 노출한다.
export function DesktopNavLinks({
  usedTradeEnabled,
}: {
  usedTradeEnabled: boolean;
}) {
  const pathname = usePathname();
  const links = visibleTabs({ usedTradeEnabled }).filter(
    (tab) => tab.key !== "mypage",
  );

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
