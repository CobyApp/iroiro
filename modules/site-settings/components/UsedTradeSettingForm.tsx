"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUsedTradeSetting } from "../actions";

// 중고거래 설정 — 판매 수수료(%)만. bp(만분율)로 저장하되 UI는 %.
// 기능 온오프 스위치는 제거됐다(중고거래 상시 활성).
export function UsedTradeSettingForm({ initialFeeBp }: { initialFeeBp: number }) {
  const [feePercent, setFeePercent] = useState(
    String(initialFeeBp / 100), // 1000bp → "10"
  );
  const [pending, startTransition] = useTransition();

  function save() {
    const percent = Number(feePercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
      toast.error("수수료는 0~50% 사이로 입력하세요");
      return;
    }
    const feeBp = Math.round(percent * 100);
    startTransition(async () => {
      try {
        await updateUsedTradeSetting({ feeBp });
        toast.success(`중고거래 수수료 ${percent}% 저장됨`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <section className="max-w-xl rounded-md border border-border bg-card p-5 shadow-card">
      <h3 className="font-semibold text-foreground">중고거래 (유저 간 거래)</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        중고거래는 항상 켜져 있어요. 수수료는 거래 시점에 스냅샷되어 이후 변경해도
        지난 거래에는 영향이 없어요.
      </p>

      <div className="mt-4 space-y-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-foreground">
            판매 수수료 (%)
          </span>
          <div className="flex items-center gap-1.5">
            <Input
              value={feePercent}
              onChange={(e) => setFeePercent(e.target.value)}
              inputMode="decimal"
              className="h-9 w-24 text-right"
              aria-label="판매 수수료 퍼센트"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </label>

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </section>
  );
}
