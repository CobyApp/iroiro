"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  resolveUsedDisputeRefund,
  resolveUsedDisputeRelease,
} from "../admin-actions";
import {
  USED_DISPUTE_REASON_LABEL,
  USED_TRADE_KIND_LABEL,
  type UsedDisputeReason,
  type UsedTradeKind,
} from "../types";
import type { UsedDisputeItem } from "../lib/report";

// 분쟁 사유 문자열("reason" 또는 "reason — detail")을 라벨 + 상세로 분해.
function readReason(raw: string | null): { label: string; detail: string } {
  if (!raw) return { label: "사유 미상", detail: "" };
  const [key, ...rest] = raw.split(" — ");
  const label = USED_DISPUTE_REASON_LABEL[key as UsedDisputeReason] ?? key;
  return { label, detail: rest.join(" — ") };
}

export function UsedDisputeQueue({ items }: { items: UsedDisputeItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-card">
        미해결 분쟁이 없어요.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <DisputeRow key={item.tradeId} item={item} />
      ))}
    </ul>
  );
}

function DisputeRow({ item }: { item: UsedDisputeItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const reason = readReason(item.disputeReason);
  const refundAmount = item.price + item.shippingFee - item.pointsUsed;

  function run(action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.message ?? "처리에 실패했어요");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 rounded-md border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/used/${item.listingId}`} className="block truncate font-medium text-foreground hover:underline">
            {item.listingTitle}
          </Link>
          <p className="text-xs text-muted-foreground">
            {USED_TRADE_KIND_LABEL[item.tradeKind as UsedTradeKind] ?? item.tradeKind} · 구매자 {item.buyerMasked} · 판매자 {item.sellerMasked}
          </p>
        </div>
        <span className="shrink-0 text-right text-sm font-semibold">₩{item.price.toLocaleString()}</span>
      </div>

      <div className="rounded-md bg-muted/40 p-2.5 text-sm">
        <p className="font-medium text-foreground">{reason.label}</p>
        {reason.detail && <p className="mt-0.5 text-xs text-muted-foreground">{reason.detail}</p>}
        {item.disputedAt && (
          <p className="mt-1 text-[11px] text-muted-foreground">신고 {new Date(item.disputedAt).toLocaleString("ko-KR")}</p>
        )}
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="처리 메모(선택)"
        className="h-9 text-sm"
        maxLength={500}
      />
      <div className="flex gap-2">
        <ConfirmDialog
          title="구매자에게 환불할까요?"
          description={`결제 ₩${refundAmount.toLocaleString()}를 환불하고 매물을 다시 판매중으로 되돌려요.`}
          confirmLabel="환불 처리"
          destructive
          pending={pending}
          onConfirm={() => run(() => resolveUsedDisputeRefund(item.tradeId, note), "환불로 종결했어요")}
          trigger={
            <Button variant="outline" size="sm" className="flex-1" disabled={pending}>
              구매자 환불
            </Button>
          }
        />
        <ConfirmDialog
          title="판매자에게 정산할까요?"
          description="거래를 완료로 종결하고 판매자에게 정산해요."
          confirmLabel="정산 처리"
          pending={pending}
          onConfirm={() => run(() => resolveUsedDisputeRelease(item.tradeId, note), "정산으로 종결했어요")}
          trigger={
            <Button size="sm" className="flex-1" disabled={pending}>
              판매자 정산
            </Button>
          }
        />
      </div>
    </li>
  );
}
