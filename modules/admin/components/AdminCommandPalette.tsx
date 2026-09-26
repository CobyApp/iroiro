"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CommandItem = {
  key: string;
  label: string;
  href: string;
  /** 소속 관리 공간 이름(그룹 헤더·검색 보조). */
  scope: string;
  /** 관리 공간 식별자(그룹 묶음 판정). */
  scopeKey: string;
  /** 관리 공간 영문 배지(그룹 헤더 표시). */
  scopeBadge: string;
  /** 관리 공간 배지 색상 클래스(공간별 구분감). */
  scopeBadgeClassName: string;
  /** 섹션 제목(있으면 검색 보조). */
  group?: string;
};

// 관리자 전역 명령 팔레트 — ⌘K/Ctrl+K 로 열어 모든 관리 메뉴를 검색해 즉시 이동.
// 항목은 서버(셸)에서 권한 필터를 거쳐 내려온다. 순수 클라이언트 네비게이션이라 별도 API 불필요.
export function AdminCommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // 열림 상태를 바꾸며 열릴 때 검색어·선택을 초기화(effect 내 setState 회피).
  function changeOpen(next: boolean) {
    if (next) {
      setQ("");
      setActive(0);
    }
    setOpen(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        changeOpen(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(term) ||
        it.scope.toLowerCase().includes(term) ||
        (it.group ?? "").toLowerCase().includes(term),
    );
  }, [items, q]);

  // 선택 인덱스는 렌더 시점에 결과 범위로 보정(effect 미사용).
  const activeIdx = Math.min(active, Math.max(0, results.length - 1));

  function go(item: CommandItem | undefined) {
    if (!item) return;
    changeOpen(false);
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[activeIdx]);
    }
  }

  return (
    <>
      {/* 헤더 버튼 — 데스크톱은 단축키 힌트, 모바일은 아이콘만(⌘K 없음) */}
      <button
        type="button"
        onClick={() => changeOpen(true)}
        aria-label="메뉴 검색"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted sm:px-3"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">메뉴 검색</span>
        <kbd className="hidden rounded border border-border bg-card px-1.5 text-[10px] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogHeader className="border-b border-border px-3 py-2.5">
            <DialogTitle className="sr-only">메뉴 검색</DialogTitle>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="관리 메뉴·기능 검색…"
                className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </DialogHeader>
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">결과가 없어요.</li>
            ) : (
              results.map((it, i) => {
                // 관리 공간(scope)이 바뀌는 첫 항목 위에 공간 구분 헤더를 얹는다 — 공간별 구분감.
                const isGroupStart = i === 0 || results[i - 1].scopeKey !== it.scopeKey;
                return (
                  <li key={`${it.scopeKey}:${it.key}:${it.href}`}>
                    {isGroupStart && (
                      <div className="sticky top-0 z-[1] flex items-center gap-2 bg-card/95 px-2 pb-1 pt-2.5 backdrop-blur">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${it.scopeBadgeClassName}`}
                        >
                          {it.scopeBadge}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {it.scope}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(it)}
                      className={[
                        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        i === activeIdx ? "bg-primary/10 text-primary" : "hover:bg-muted",
                      ].join(" ")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{it.label}</span>
                        {it.group && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {it.group}
                          </span>
                        )}
                      </span>
                      {i === activeIdx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
