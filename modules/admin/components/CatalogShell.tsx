"use client";

import { useState } from "react";
import {
  Download,
  LayoutDashboard,
  Menu,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import { AdminSidebar, type NavSection } from "./AdminSidebar";
import { AdminAccountMenu } from "./AdminAccountMenu";

// 카탈로그 전용 공간 메뉴 — 토레카 마스터 데이터만 다룬다(운영 관리자 메뉴와 분리).
// 홈은 정확히 /catalog일 때만 활성(matchPrefix 없음), 나머지는 하위 경로까지 활성.
const CATALOG_NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: "카탈로그 홈 · AI", href: "/catalog", icon: LayoutDashboard }],
  },
  {
    title: "토레카",
    items: [
      {
        label: "토레카",
        href: "/catalog/cards",
        icon: WalletCards,
        matchPrefix: "/catalog/cards",
      },
      {
        label: "분석기 가져오기",
        href: "/catalog/import",
        icon: Download,
        matchPrefix: "/catalog/import",
      },
    ],
  },
  {
    title: "아티스트",
    items: [
      {
        label: "그룹",
        href: "/catalog/teams",
        icon: Users,
        matchPrefix: "/catalog/teams",
      },
      {
        label: "멤버",
        href: "/catalog/members",
        icon: User,
        matchPrefix: "/catalog/members",
      },
    ],
  },
];

// 카탈로그 셸 — 관리자 셸과 같은 헤더/드로어/접기 UI를 쓰되, 배지와 메뉴만 카탈로그용.
// 드로어·접기 로직은 AdminSidebar에 sections를 주입해 재사용한다(중복 구현 금지).
export function CatalogShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-background">
      <header className="flex items-center justify-between gap-2 border-b-[3px] border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            className="grid h-9 w-9 place-items-center rounded-md text-foreground hover:bg-muted md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLockup
            markClassName="h-9 w-9"
            wordmarkClassName="h-6"
            preload
          />
          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
            CATALOG
          </span>
        </div>
        <AdminAccountMenu />
      </header>
      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[auto_1fr]">
        <AdminSidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sections={CATALOG_NAV_SECTIONS}
          ariaLabel="카탈로그 메뉴"
        />
        <main className="min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
