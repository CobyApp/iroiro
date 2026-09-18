"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminGrantCoupons, adminGrantPoints } from "../actions";

// 운영자 수동 지급 — 이메일/닉네임 정확 일치로만 대상 지정(오지급 방지).
export function AdminPointsGrantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [couponCount, setCouponCount] = useState("1");

  function grantPoints() {
    const value = Number(amount.replace(/[^0-9-]/g, ""));
    if (!Number.isInteger(value) || value === 0) {
      toast.error("지급(또는 차감)할 포인트를 입력해주세요");
      return;
    }
    startTransition(async () => {
      const result = await adminGrantPoints({
        query,
        amount: value,
        memo: memo || undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `${result.data.accountName}님에게 ${value > 0 ? "+" : ""}${value.toLocaleString()}P — 잔액 ${result.data.balance.toLocaleString()}P`,
      );
      setAmount("");
      setMemo("");
      router.refresh();
    });
  }

  function grantCoupons() {
    const count = Number(couponCount);
    startTransition(async () => {
      const result = await adminGrantCoupons({ query, count });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `${result.data.accountName}님에게 무료배송 쿠폰 ${count}장 지급`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="grant-query">대상 회원 (이메일 또는 닉네임, 정확 일치)</Label>
        <Input
          id="grant-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="user@example.com 또는 닉네임"
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Coins className="h-4 w-4 text-primary" />
            포인트 지급 · 차감
          </p>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="예: 1000 (차감은 -1000)"
            disabled={pending}
            aria-label="포인트 금액"
          />
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 (예: 이벤트 보상)"
            maxLength={200}
            disabled={pending}
            aria-label="메모"
          />
          <Button
            onClick={grantPoints}
            disabled={pending || !query.trim()}
            size="sm"
            className="w-full"
          >
            포인트 지급
          </Button>
        </div>

        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Ticket className="h-4 w-4 text-primary" />
            무료배송 쿠폰 지급
          </p>
          <Input
            inputMode="numeric"
            value={couponCount}
            onChange={(e) => setCouponCount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="장수 (1~10)"
            disabled={pending}
            aria-label="쿠폰 장수"
          />
          <Button
            onClick={grantCoupons}
            disabled={
              pending ||
              !query.trim() ||
              !(Number(couponCount) >= 1 && Number(couponCount) <= 10)
            }
            size="sm"
            variant="outline"
            className="w-full"
          >
            쿠폰 지급
          </Button>
        </div>
      </div>
    </div>
  );
}
