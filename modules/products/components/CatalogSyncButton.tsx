"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncCatalogDraftProducts } from "../actions";

// 카탈로그 → 상품 백필 버튼. 아직 상품이 없는 활성 카드를 임시저장 상품으로 편입한다.
// 서버가 한 번에 일정량만 처리하고 remaining 을 돌려주므로, 0이 될 때까지 반복 호출한다(진행률 토스트).
export function CatalogSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  function handleSync() {
    if (running) return;
    setRunning(true);
    startTransition(async () => {
      const toastId = toast.loading("카탈로그 동기화 중…");
      let total = 0;
      try {
        // 안전 상한(무한 루프 방지) — 배치 25장 × 400 = 최대 1만 장.
        for (let i = 0; i < 400; i += 1) {
          const result = await syncCatalogDraftProducts({});
          if (!result.ok) {
            toast.error(result.message, { id: toastId });
            return;
          }
          total += result.data.created;
          if (result.data.remaining <= 0 || result.data.created === 0) {
            toast.success(
              total > 0
                ? `임시저장 상품 ${total.toLocaleString()}개를 편입했어요`
                : "이미 모든 카드가 상품으로 등록돼 있어요",
              { id: toastId },
            );
            router.refresh();
            return;
          }
          toast.loading(`카탈로그 동기화 중… ${total.toLocaleString()}개 편입`, { id: toastId });
        }
        toast.success(`${total.toLocaleString()}개 편입 — 남은 건 다시 눌러 이어서 진행하세요`, {
          id: toastId,
        });
        router.refresh();
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <Button type="button" variant="outline" onClick={handleSync} disabled={pending || running}>
      <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} aria-hidden />
      카탈로그 동기화
    </Button>
  );
}
