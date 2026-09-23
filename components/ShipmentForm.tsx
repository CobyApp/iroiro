"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COURIERS } from "@/lib/shipping/couriers";

// 발송 처리 입력 — 택배사 선택 + 송장번호. 판매자/관리자가 실제 번호를 넣으면 구매자가 무료 조회.
export function ShipmentForm({
  onSubmit,
  pending = false,
  submitLabel = "발송 완료",
}: {
  onSubmit: (courier: string, trackingCode: string) => void;
  pending?: boolean;
  submitLabel?: string;
}) {
  const [courier, setCourier] = useState<string>(COURIERS[0]?.code ?? "cj");
  const [code, setCode] = useState("");
  const disabled = pending || code.trim().length < 6;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          aria-label="택배사"
          className="h-9 shrink-0 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {COURIERS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
          inputMode="numeric"
          maxLength={40}
          placeholder="송장번호 입력"
          aria-label="송장번호"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button
        size="sm"
        className="w-full gap-1.5"
        disabled={disabled}
        onClick={() => onSubmit(courier, code.trim())}
      >
        <Truck className="h-4 w-4" />
        {submitLabel}
      </Button>
    </div>
  );
}
