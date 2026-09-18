"use client";

import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { REFERRAL_POINTS } from "@/modules/points/lib/rules";

type Props = {
  code: string;
  invitedCount: number;
  earnedPoints: number;
};

// 친구 초대 카드 — 링크 복사 한 번이 전부인 초간단 리퍼럴 UI.
export function InviteCard({ code, invitedCount, earnedPoints }: Props) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("초대 링크를 복사했어요. 친구에게 공유해보세요!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했어요. 링크를 직접 선택해 복사해주세요");
    }
  }

  return (
    <section
      className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4"
      aria-label="친구 초대"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <UserPlus className="h-4 w-4 text-primary" aria-hidden />
          친구 초대
        </p>
        {invitedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {invitedCount}명 초대 · +{earnedPoints.toLocaleString()}P 적립
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        친구가 이 링크로 가입하면{" "}
        <b className="text-foreground">
          둘 다 {REFERRAL_POINTS.toLocaleString()}P
        </b>
        를 받아요.
      </p>
      <div className="flex gap-2">
        <code className="flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground">
          /invite/{code}
        </code>
        <Button size="sm" onClick={copy} className="shrink-0 gap-1.5">
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          링크 복사
        </Button>
      </div>
    </section>
  );
}
