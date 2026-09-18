"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  syncCatalogFromExternal,
  type CatalogSyncResult,
} from "../bulk-actions";

// 카탈로그 동기화 — 외부 분석기의 시리즈·시세를 우리 데이터에 백필/갱신한다.
export function CatalogSyncButton() {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<CatalogSyncResult | null>(null);

  function run() {
    startTransition(async () => {
      try {
        const res = await syncCatalogFromExternal();
        setLast(res);
        toast.success(
          `동기화 완료 — 시리즈 +${res.seriesCreated} · 토레카 +${res.cardsCreated}/갱신 ${res.cardsUpdated} · 상품 ${res.productsUpdated}건`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "동기화 실패");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={pending}
        className="gap-1.5"
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {pending ? "동기화 중…" : "카탈로그 동기화"}
      </Button>
      {last && !pending && (
        <span className="text-xs text-muted-foreground">
          시리즈 +{last.seriesCreated} · 토레카 +{last.cardsCreated} · 상품 {last.productsUpdated}건
        </span>
      )}
    </div>
  );
}
