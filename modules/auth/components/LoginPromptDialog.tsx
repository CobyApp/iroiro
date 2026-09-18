"use client";

import Link from "next/link";
import { Check, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LOGIN_REQUIRED_FEATURES,
  type LoginRequiredFeature,
} from "../lib/login-required";

type Props = {
  feature: LoginRequiredFeature;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// 보호 기능을 누른 자리에서 이유를 짧게 설명하고 로그인으로 안내한다.
// 모바일 우선 — 한 컬럼, 큰 버튼, 스크롤 없이 한눈에 들어오는 높이.
export function LoginPromptDialog({ feature, open, onOpenChange }: Props) {
  const content = LOGIN_REQUIRED_FEATURES[feature];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6">
        <DialogHeader className="items-start text-left">
          <span className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <DialogTitle className="font-display text-lg leading-snug">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {content.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {benefit}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <Button asChild size="lg" className="w-full">
            <Link href="/login">로그인하고 계속하기</Link>
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="w-full">
              계속 둘러보기
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
