"use client";

import { useTransition, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { logout } from "@/modules/auth/actions";

// 로그아웃 확인 — 실수 클릭 방지. 트리거는 호출부가 원하는 모양으로 넘긴다.
export function LogoutConfirmDialog({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>로그아웃할까요?</DialogTitle>
          <DialogDescription>
            언제든 다시 로그인하면 찜·컬렉션·포인트가 그대로 이어져요.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            className="w-full gap-1.5"
            disabled={pending}
            onClick={() => startTransition(() => logout())}
          >
            <LogOut className="h-4 w-4" />
            {pending ? "로그아웃 중…" : "로그아웃"}
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" className="w-full" disabled={pending}>
              계속 둘러보기
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
