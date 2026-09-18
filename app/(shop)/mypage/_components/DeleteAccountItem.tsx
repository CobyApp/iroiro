"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteAccount } from "@/modules/auth/actions";

const CONFIRM_TEXT = "탈퇴합니다";

// 회원 탈퇴 — 무엇이 사라지는지 먼저 안내하고, 확인 문구 입력까지
// 거쳐야 실행된다(소프트 삭제).
export function DeleteAccountItem() {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState("");

  return (
    <Dialog onOpenChange={(open) => !open && setConfirm("")}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
        >
          <Trash2 className="h-4 w-4" />
          회원 탈퇴
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            정말 탈퇴하시겠어요?
          </DialogTitle>
          <DialogDescription>
            탈퇴 전에 아래 내용을 꼭 확인해주세요.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
          <li>
            · 계정이 <b>즉시 비활성화</b>되고 다시 로그인할 수 없어요.
          </li>
          <li>
            · 보유한 <b>포인트·쿠폰은 모두 소멸</b>되며 복구되지 않아요.
          </li>
          <li>· 찜 목록·컬렉션·최애 설정을 더 볼 수 없어요.</li>
          <li>
            · 배송 중인 주문·진행 중인 경매/거래가 있다면{" "}
            <b>완료 후 탈퇴</b>를 권장해요.
          </li>
          <li>
            · 주문·결제 기록은 관련 법령에 따라 일정 기간 보관 후 파기돼요.
          </li>
        </ul>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            계속하려면{" "}
            <b className="text-foreground">{CONFIRM_TEXT}</b>를 입력해주세요.
          </p>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_TEXT}
            aria-label="탈퇴 확인 문구"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            className="w-full"
            disabled={pending || confirm.trim() !== CONFIRM_TEXT}
            onClick={() => startTransition(() => deleteAccount())}
          >
            {pending ? "처리 중…" : "탈퇴하기"}
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" className="w-full" disabled={pending}>
              그대로 있을래요
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
