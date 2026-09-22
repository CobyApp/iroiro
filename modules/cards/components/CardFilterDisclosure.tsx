"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// 카드 목록 필터 칩(그룹·AI·멤버)을 폰에서는 「필터」 토글 뒤로 접는다 — 탭·검색·칩 두 줄이 첫 화면을
// 다 차지하지 않게. md 이상에서는 토글이 사라지고 항상 펼쳐진다. 필터가 걸려 있으면 기본 펼침.
export function CardFilterDisclosure({
  children,
  defaultOpen = false,
  activeCount = 0,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  /** 현재 적용된 필터 수 — 접힌 상태에서도 배지로 보여준다. */
  activeCount?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="card-filter-chips"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted md:hidden"
      >
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          필터
          {activeCount > 0 && (
            <span className="catalog-stat rounded-full bg-primary/10 px-1.5 py-px text-[11px] text-primary">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div id="card-filter-chips" className={cn("space-y-3", open ? "block" : "hidden md:block")}>
        {children}
      </div>
    </div>
  );
}
