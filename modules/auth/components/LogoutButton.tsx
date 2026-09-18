"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutConfirmDialog } from "./LogoutConfirmDialog";

// 헤더 드롭인 — 확인 다이얼로그를 거쳐 로그아웃(실수 클릭 방지).
// 모바일은 아이콘만, 데스크톱은 아이콘+라벨.
export function LogoutButton() {
  return (
    <LogoutConfirmDialog>
      <Button type="button" variant="ghost" size="sm" aria-label="로그아웃">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">로그아웃</span>
      </Button>
    </LogoutConfirmDialog>
  );
}
