"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  visibleSections,
  type NavSection,
  type NavViewer,
} from "../lib/nav";

// 메뉴 항목 / 토글 버튼 공통 클래스. collapsed는 데스크톱(md+)에서만 아이콘-only.
function rowClass(active: boolean, collapsed: boolean): string {
  return cn(
    "flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "border border-border bg-primary text-primary-foreground shadow-card"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    collapsed && "md:justify-center md:px-2",
  );
}

// 섹션 목록 렌더 — 데스크톱 사이드바와 모바일 드로어가 같은 마크업을 공유한다.
function NavList({
  sections,
  pathname,
  collapsed,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-3 p-2">
      {sections.map((section, sectionIndex) => (
        <div
          key={section.title ?? `section-${sectionIndex}`}
          className={cn(
            "space-y-1",
            collapsed && sectionIndex > 0 && "md:border-t md:border-border/50 md:pt-3",
          )}
        >
          {section.title && (
            <p
              className={cn(
                "px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70",
                collapsed && "md:hidden",
              )}
            >
              {section.title}
            </p>
          )}
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                className={rowClass(active, collapsed)}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                {Icon ? (
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                ) : (
                  <span className="h-5 w-5 shrink-0" aria-hidden />
                )}
                <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// 공용 사이드바 — 모바일(md 미만)은 Sheet 드로어(포커스 트랩·Escape·스크롤 락·닫기 버튼 내장),
// 데스크톱(md+)은 헤더 아래 고정(sticky)되는 접기 가능한 정적 사이드바.
export function AdminSidebar({
  mobileOpen,
  onClose,
  sections,
  viewer,
  ariaLabel = "관리자 메뉴",
}: {
  mobileOpen: boolean;
  onClose: () => void;
  sections: NavSection[];
  viewer: NavViewer;
  ariaLabel?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const visible = visibleSections(sections, viewer);

  return (
    <>
      {/* 모바일 드로어 */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="left"
          aria-label={ariaLabel}
          // 내비 드로어에는 설명문이 없다 — Radix의 Description 누락 경고를 의도적으로 끈다.
          aria-describedby={undefined}
          className="w-[min(80vw,18rem)] gap-0 rounded-none border-r-[3px] border-border p-0 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden"
        >
          <SheetTitle className="sr-only">{ariaLabel}</SheetTitle>
          {/* 닫기(X) 버튼 자리를 비워두는 상단 여백 */}
          <div className="h-9" aria-hidden />
          <NavList
            sections={visible}
            pathname={pathname}
            collapsed={false}
            onNavigate={onClose}
          />
        </SheetContent>
      </Sheet>

      {/* 데스크톱 사이드바 */}
      <aside
        className={cn(
          "hidden shrink-0 border-r-[3px] border-border bg-card md:sticky md:top-[var(--admin-header-h)] md:flex md:h-[calc(100dvh-var(--admin-header-h))] md:flex-col md:overflow-y-auto md:transition-[width]",
          collapsed ? "md:w-16" : "md:w-60",
        )}
        aria-label={ariaLabel}
      >
        <NavList sections={visible} pathname={pathname} collapsed={collapsed} />

        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={cn(rowClass(false, collapsed), "w-full")}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5 shrink-0" />
            ) : (
              <PanelLeftClose className="h-5 w-5 shrink-0" />
            )}
            <span className={cn(collapsed && "md:hidden")}>접기</span>
          </button>
        </div>
      </aside>
    </>
  );
}
