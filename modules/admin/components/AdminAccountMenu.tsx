"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LogoutConfirmDialog } from "@/modules/auth/components/LogoutConfirmDialog";

// 관리자 헤더 우측 계정 메뉴 — 계정 액션(로그아웃)만. 스토어/스토어 설정은 두지 않는다.
export function AdminAccountMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-full border border-border bg-lemon text-xs shadow-card">
            👤
          </span>
          <span className="hidden sm:inline">관리자</span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-2">
        <p className="truncate px-3 pb-2 pt-1 text-xs text-muted-foreground">
          관리자로 로그인됨
        </p>
        <div className="border-t-2 border-border/30 pt-1">
          <LogoutConfirmDialog>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </LogoutConfirmDialog>
        </div>
      </PopoverContent>
    </Popover>
  );
}
