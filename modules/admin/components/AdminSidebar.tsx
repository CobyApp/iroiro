"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Check,
  Star,
  EyeOff,
  Eye,
  ChevronUp,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  visibleSections,
  type NavItem,
  type NavSection,
  type NavViewer,
} from "../lib/nav";

// 관리자별(브라우저별) 메뉴 개인화 — localStorage. pinned=즐겨찾기(상단, 순서 유지), hidden=숨김.
type MenuPrefs = { pinned: string[]; hidden: string[] };
const EMPTY_PREFS: MenuPrefs = { pinned: [], hidden: [] };
const prefsKey = (scope: string) => `iroiro:adminmenu:${scope}`;

function readPrefs(scope: string): MenuPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(scope));
    if (!raw) return EMPTY_PREFS;
    const p = JSON.parse(raw) as Partial<MenuPrefs>;
    return {
      pinned: Array.isArray(p.pinned) ? p.pinned.filter((x) => typeof x === "string") : [],
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((x) => typeof x === "string") : [],
    };
  } catch {
    return EMPTY_PREFS;
  }
}

function rowClass(active: boolean, collapsed: boolean): string {
  return cn(
    "flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "border border-border bg-primary text-primary-foreground shadow-card"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    collapsed && "md:justify-center md:px-2",
  );
}

type EditApi = {
  isPinned: (key: string) => boolean;
  isHidden: (key: string) => boolean;
  togglePin: (key: string) => void;
  toggleHide: (key: string) => void;
  move: (key: string, dir: -1 | 1) => void;
};

function EditControls({ item, api, canMove }: { item: NavItem; api: EditApi; canMove: boolean }) {
  const pinned = api.isPinned(item.key);
  const hidden = api.isHidden(item.key);
  return (
    <span className="flex items-center gap-0.5">
      {pinned && canMove && (
        <>
          <button type="button" onClick={() => api.move(item.key, -1)} aria-label="위로" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => api.move(item.key, 1)} aria-label="아래로" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <ChevronDown className="h-4 w-4" />
          </button>
        </>
      )}
      <button type="button" onClick={() => api.togglePin(item.key)} aria-label={pinned ? "즐겨찾기 해제" : "즐겨찾기"} className={cn("grid h-7 w-7 place-items-center rounded-md hover:bg-muted", pinned ? "text-primary" : "text-muted-foreground")}>
        <Star className={cn("h-4 w-4", pinned && "fill-current")} />
      </button>
      <button type="button" onClick={() => api.toggleHide(item.key)} aria-label={hidden ? "숨김 해제" : "숨기기"} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
        {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </span>
  );
}

function NavList({
  sections,
  pathname,
  collapsed,
  onNavigate,
  editApi,
}: {
  sections: NavSection[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  editApi?: EditApi;
}) {
  return (
    <nav className="flex-1 space-y-3 p-2">
      {sections.map((section, sectionIndex) => (
        <div
          key={section.title ?? `section-${sectionIndex}`}
          className={cn("space-y-1", collapsed && sectionIndex > 0 && "md:border-t md:border-border/50 md:pt-3")}
        >
          {section.title && (
            <p className={cn("px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70", collapsed && "md:hidden")}>
              {section.title}
            </p>
          )}
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item);
            // 편집 모드 — 링크 대신 이름 + 제어 버튼 행.
            if (editApi) {
              const hidden = editApi.isHidden(item.key);
              return (
                <div key={item.key} className={cn("flex items-center justify-between gap-2 rounded-full px-3 py-1.5 text-sm", hidden && "opacity-45")}>
                  <span className="flex min-w-0 items-center gap-3 text-muted-foreground">
                    {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : <span className="h-5 w-5 shrink-0" aria-hidden />}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <EditControls item={item} api={editApi} canMove={section.title === "즐겨찾기"} />
                </div>
              );
            }
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                className={rowClass(active, collapsed)}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : <span className="h-5 w-5 shrink-0" aria-hidden />}
                <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// 공용 사이드바 — 모바일은 Sheet 드로어, 데스크톱은 접기 가능한 정적 사이드바.
// 데스크톱에서 "메뉴 편집"으로 즐겨찾기(핀)·숨김·순서를 개인화(브라우저별 저장). 저장 결과는 모바일에도 반영.
export function AdminSidebar({
  mobileOpen,
  onClose,
  sections,
  viewer,
  ariaLabel = "관리자 메뉴",
  scopeKey,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  sections: NavSection[];
  viewer: NavViewer;
  ariaLabel?: string;
  scopeKey: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [prefs, setPrefs] = useState<MenuPrefs>(EMPTY_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();

  // 마운트 후 1회 localStorage 개인화 로드 — SSR/CSR 하이드레이션 불일치를 피하려 effect 에서 읽는다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 클라이언트 전용 저장소 1회 하이드레이션(의도)
    setPrefs(readPrefs(scopeKey));
    setHydrated(true);
  }, [scopeKey]);

  function save(next: MenuPrefs) {
    setPrefs(next);
    try {
      localStorage.setItem(prefsKey(scopeKey), JSON.stringify(next));
    } catch {
      // 저장 실패(프라이빗 모드 등) — 이번 세션에는 반영, 영구 저장만 생략.
    }
  }

  const visible = visibleSections(sections, viewer);
  const permittedKeys = new Set(visible.flatMap((s) => s.items.map((i) => i.key)));
  const itemByKey = new Map<string, NavItem>();
  for (const s of visible) for (const i of s.items) itemByKey.set(i.key, i);

  const editApi: EditApi = {
    isPinned: (key) => prefs.pinned.includes(key),
    isHidden: (key) => prefs.hidden.includes(key),
    togglePin: (key) =>
      save(
        prefs.pinned.includes(key)
          ? { ...prefs, pinned: prefs.pinned.filter((k) => k !== key) }
          : { pinned: [...prefs.pinned, key], hidden: prefs.hidden.filter((k) => k !== key) },
      ),
    toggleHide: (key) =>
      save(
        prefs.hidden.includes(key)
          ? { ...prefs, hidden: prefs.hidden.filter((k) => k !== key) }
          : { pinned: prefs.pinned.filter((k) => k !== key), hidden: [...prefs.hidden, key] },
      ),
    move: (key, dir) => {
      const arr = [...prefs.pinned];
      const i = arr.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      save({ ...prefs, pinned: arr });
    },
  };

  // 즐겨찾기 섹션(핀 순서) + 일반 섹션. 편집 모드면 전부 노출(제어), 보기 모드면 핀/숨김 반영.
  function displaySections(edit: boolean): NavSection[] {
    const pinnedItems = hydrated
      ? prefs.pinned.filter((k) => permittedKeys.has(k)).map((k) => itemByKey.get(k)!).filter(Boolean)
      : [];
    const out: NavSection[] = [];
    if (pinnedItems.length > 0) out.push({ title: "즐겨찾기", items: pinnedItems });
    for (const s of visible) {
      const items = s.items.filter((i) => {
        if (edit) return true;
        if (prefs.hidden.includes(i.key)) return false;
        if (prefs.pinned.includes(i.key)) return false; // 즐겨찾기로 이동됨
        return true;
      });
      if (items.length > 0) out.push({ ...s, items });
    }
    return out;
  }

  const desktopSections = displaySections(editMode);
  const mobileSections = displaySections(false);

  return (
    <>
      {/* 모바일 드로어 — 저장된 개인화 반영(편집은 데스크톱에서). */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="left"
          aria-label={ariaLabel}
          aria-describedby={undefined}
          className="w-[min(80vw,18rem)] gap-0 rounded-none border-r-[3px] border-border p-0 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden"
        >
          <SheetTitle className="sr-only">{ariaLabel}</SheetTitle>
          <div className="h-9" aria-hidden />
          <NavList sections={mobileSections} pathname={pathname} collapsed={false} onNavigate={onClose} />
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
        {editMode && !collapsed && (
          <p className="px-4 pt-3 text-[11px] text-muted-foreground">
            ★ 즐겨찾기 · 눈 아이콘으로 숨김 · 화살표로 순서 변경
          </p>
        )}
        <NavList
          sections={desktopSections}
          pathname={pathname}
          collapsed={collapsed && !editMode}
          editApi={editMode ? editApi : undefined}
        />

        <div className="space-y-1 border-t border-border p-2">
          {/* 메뉴 편집 토글 — 접힘 상태에서는 숨긴다(공간 부족). */}
          {!collapsed && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={cn(rowClass(false, false), "flex-1")}
                aria-pressed={editMode}
              >
                {editMode ? <Check className="h-5 w-5 shrink-0" /> : <Pencil className="h-5 w-5 shrink-0" />}
                <span>{editMode ? "완료" : "메뉴 편집"}</span>
              </button>
              {editMode && (prefs.pinned.length > 0 || prefs.hidden.length > 0) && (
                <button
                  type="button"
                  onClick={() => save(EMPTY_PREFS)}
                  aria-label="초기화"
                  className="grid w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={cn(rowClass(false, collapsed), "w-full")}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5 shrink-0" /> : <PanelLeftClose className="h-5 w-5 shrink-0" />}
            <span className={cn(collapsed && "md:hidden")}>접기</span>
          </button>
        </div>
      </aside>
    </>
  );
}
