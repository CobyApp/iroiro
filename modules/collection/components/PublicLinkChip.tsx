"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { publicCode: string };

// 공개 페이지 링크 칩 — 절대 URL(현재 origin 기준)을 클립보드에 복사.
// 비공개 컬렉션 링크는 404라 혼란을 주므로 공개 상태에서만 렌더한다(호출부 규칙).
export function PublicLinkChip({ publicCode }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/collections/${publicCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("링크를 복사했습니다");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-3 pr-0.5">
      <span className="font-mono text-xs text-muted-foreground">
        {publicCode}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        aria-label="공개 링크 복사"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
}
