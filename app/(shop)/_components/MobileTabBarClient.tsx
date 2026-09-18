"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isTabActive, visibleTabs } from "./mobile-tabs";
import { SHOP_NAVIGATION_ICONS } from "./shop-navigation-icons";

// 모바일 전용 하단 고정 탭바. sm 이상에선 숨김(sm:hidden).
// 둘러보기·중고거래·커뮤니티·마이 4탭. 장바구니는 상단 헤더가 담당.
export function MobileTabBarClient() {
  const pathname = usePathname();
  const tabs = visibleTabs();

  return (
    <nav
      aria-label="하단 내비게이션"
      className="shop-mobile-tabs fixed inset-x-0 bottom-0 z-40 border-t border-border bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {tabs.map((def) => {
          const Icon = SHOP_NAVIGATION_ICONS[def.key];
          const active = isTabActive(def.key, pathname);
          return (
            <li key={def.key} className="flex-1">
              <Link
                href={def.href}
                aria-current={active ? "page" : undefined}
                aria-label={def.label}
                className={cn(
                  "group flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-muted-foreground transition-colors",
                  active && "text-primary",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-7 min-w-10 place-items-center rounded-full transition-[background-color,transform] group-active:scale-95",
                    active && "bg-primary/12",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "max-w-full truncate font-medium text-[10px] leading-none",
                    active && "font-semibold",
                  )}
                >
                  {def.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
