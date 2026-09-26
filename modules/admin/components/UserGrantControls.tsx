"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminGrantCouponsToAccount,
  adminGrantPointsToAccount,
} from "@/modules/points/actions";

// 회원 상세 — 이 회원에게 직접 포인트/무료배송 쿠폰 지급(accountId 기준).
export function UserGrantControls({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [couponCount, setCouponCount] = useState("1");

  function grantPoints() {
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) {
      toast.error("0이 아닌 정수 포인트를 입력해주세요");
      return;
    }
    startTransition(async () => {
      const result = await adminGrantPointsToAccount({
        accountId,
        amount: value,
        memo: memo.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `${result.data.accountName}님 ${value > 0 ? "+" : ""}${value.toLocaleString()}P — 잔액 ${result.data.balance.toLocaleString()}P`,
      );
      setAmount("");
      setMemo("");
      router.refresh();
    });
  }

  function grantCoupons() {
    const count = Number(couponCount);
    if (!Number.isInteger(count) || count < 1) {
      toast.error("쿠폰 장수를 확인해주세요");
      return;
    }
    startTransition(async () => {
      const result = await adminGrantCouponsToAccount({ accountId, count });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`무료배송 쿠폰 ${count}장 지급`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">포인트 지급 · 차감</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))}
            inputMode="numeric"
            placeholder="포인트(음수=차감)"
            aria-label="지급 포인트"
            className="h-9 w-40 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary/50"
          />
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모(선택)"
            aria-label="메모"
            className="h-9 min-w-40 flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary/50"
          />
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={pending || !amount}
            onClick={grantPoints}
          >
            <Coins className="h-4 w-4" /> 지급
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">무료배송 쿠폰 지급</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={couponCount}
            onChange={(e) => setCouponCount(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            aria-label="쿠폰 장수"
            className="h-9 w-20 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary/50"
          />
          <span className="text-sm text-muted-foreground">장</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={pending || !couponCount}
            onClick={grantCoupons}
          >
            <Ticket className="h-4 w-4" /> 쿠폰 지급
          </Button>
        </div>
      </div>
    </div>
  );
}
