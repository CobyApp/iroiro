"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closeBuyRequest } from "../buy-actions";

// 요청자 본인 컨트롤 — 요청 종료(모집중/성사 상태에서).
export function BuyRequestOwnerControls({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClose() {
    if (!confirm("이 삽니다 요청을 종료할까요? 목록에서 사라져요.")) return;
    startTransition(async () => {
      const result = await closeBuyRequest({ requestId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("요청을 종료했어요");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={handleClose}>
      {pending ? "처리 중..." : "요청 종료"}
    </Button>
  );
}
