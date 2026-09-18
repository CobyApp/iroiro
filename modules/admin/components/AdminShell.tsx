"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { BrandLockup } from "@/modules/ui/components/BrandMark";
import { AdminSidebar } from "./AdminSidebar";
import { AdminAccountMenu } from "./AdminAccountMenu";

// 관리자 셸 — 헤더(모바일 햄버거) + 반응형 사이드바(모바일 드로어) + 본문.
// isSiteAdmin=false면 게시판 moderator — 사이드바에서 커뮤니티 관리 섹션만 노출.
export function AdminShell({
  children,
  isSiteAdmin = true,
}: {
  children: React.ReactNode;
  isSiteAdmin?: boolean;
}) {
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
            ADMIN
          </span>
        </div>
        <AdminAccountMenu />
      </header>
      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[auto_1fr]">
        <AdminSidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          isSiteAdmin={isSiteAdmin}
        />
        <main className="min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
