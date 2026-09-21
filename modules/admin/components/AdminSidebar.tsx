"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  Coins,
  ImageIcon,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Star,
  Truck,
  UserCog,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  matchPrefix?: string;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
  // 게시판 moderator에게도 노출되는 섹션(커뮤니티 관리). 없으면 site admin 전용.
  managerAllowed?: boolean;
};

// 섹션으로 묶어 순서 정리 — 홈 / 판매·상품 / 콘텐츠 / 아티스트 / 스토어.
// 계정(로그아웃)은 헤더 우측 AdminAccountMenu로.
const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: "대시보드", href: "/admin", icon: LayoutDashboard }],
  },
  {
    title: "판매",
    items: [
      {
        label: "상품",
        href: "/admin/products",
        icon: Package,
        matchPrefix: "/admin/products",
      },
      {
        label: "주문",
        href: "/admin/orders",
        icon: ShoppingBag,
        matchPrefix: "/admin/orders",
      },
      {
        label: "정산",
        href: "/admin/settlement",
        icon: Calculator,
        matchPrefix: "/admin/settlement",
      },
      {
        label: "배송",
        href: "/admin/delivery",
        icon: Truck,
        matchPrefix: "/admin/delivery",
      },
    ],
  },
  {
    // 커뮤니티 관리 — site admin + 게시판 moderator 공용.
    title: "커뮤니티",
    managerAllowed: true,
    items: [
      {
        label: "공지",
        href: "/admin/notices",
        icon: Megaphone,
        matchPrefix: "/admin/notices",
      },
      {
        label: "게시판 · 신고",
        href: "/admin/posts",
        icon: MessageSquare,
        matchPrefix: "/admin/posts",
      },
      {
        label: "회원 · 등급",
        href: "/admin/users",
        icon: UserCog,
        matchPrefix: "/admin/users",
      },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      {
        label: "배너",
        href: "/admin/banners",
        icon: ImageIcon,
        matchPrefix: "/admin/banners",
      },
      {
        label: "리뷰",
        href: "/admin/reviews",
        icon: Star,
        matchPrefix: "/admin/reviews",
      },
    ],
  },
  {
    title: "회원",
    items: [
      {
        label: "포인트 · 쿠폰",
        href: "/admin/points",
        icon: Coins,
        matchPrefix: "/admin/points",
      },
    ],
  },
  {
    title: "카탈로그",
    items: [
      {
        // 토레카·종류/포즈·그룹·멤버·분석기 가져오기는 별도 카탈로그 공간(/catalog)에서 관리한다.
        // 운영 관리자에서는 진입 링크만 둔다.
        label: "카탈로그 관리 →",
        href: "/catalog",
        icon: Layers,
        matchPrefix: "/catalog",
      },
    ],
  },
  {
    title: "스토어",
    items: [
      {
        label: "설정",
        href: "/admin/settings",
        icon: Settings,
        matchPrefix: "/admin/settings",
      },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  return pathname === item.href;
}

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

export function AdminSidebar({
  mobileOpen,
  onClose,
  isSiteAdmin = true,
  sections: sectionsProp = NAV_SECTIONS,
  ariaLabel = "관리자 메뉴",
}: {
  mobileOpen: boolean;
  onClose: () => void;
  isSiteAdmin?: boolean;
  // 다른 전용 공간(카탈로그 등)이 같은 드로어/접기 UI를 재사용할 때 메뉴 정의를 주입한다.
  sections?: NavSection[];
  ariaLabel?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  // 게시판 moderator는 커뮤니티 관리 섹션만 — 나머지는 site admin 전용.
  const sections = isSiteAdmin
    ? sectionsProp
    : sectionsProp.filter((s) => s.managerAllowed);

  return (
    <>
      {/* 모바일 백드롭 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "z-50 flex h-dvh flex-col overflow-y-auto border-r-[3px] border-border bg-card md:h-full",
          // 모바일: 좌측 오프캔버스 드로어
          "fixed inset-y-0 left-0 w-64 transition-transform duration-200",
          mobileOpen ? "translate-x-0 shadow-elevated" : "-translate-x-full",
          // 데스크톱(md+): 정적 배치 + 접기 가능
          "md:static md:z-auto md:w-60 md:translate-x-0 md:shadow-none md:transition-[width]",
          collapsed && "md:w-16",
        )}
        aria-label={ariaLabel}
      >
        <nav className="flex-1 space-y-3 p-2">
          {sections.map((section, sectionIndex) => (
            <div
              key={section.title ?? `section-${sectionIndex}`}
              className={cn(
                "space-y-1",
                collapsed &&
                  sectionIndex > 0 &&
                  "md:border-t md:border-border/50 md:pt-3",
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
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={rowClass(active, collapsed)}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className={cn(collapsed && "md:hidden")}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 접기 토글 — 데스크톱 전용 */}
        <div className="hidden border-t border-border p-2 md:block">
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
