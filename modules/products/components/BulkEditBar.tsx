"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkUpdateProducts } from "../actions";
import { SALE_STATUSES, SALE_STATUS_LABEL, type SaleStatus } from "../types";

type BulkProductPatch = {
  saleStatus?: SaleStatus;
  stockQuantity?: number;
  salePrice?: number;
};

// 어드민 상품 목록 하단 플로팅 바 — 채운 항목만 골라 한 번에 일괄 적용.
// (이전엔 항목마다 '적용' 버튼이 따로 있어 여러 번 눌러야 했다.)
export function BulkEditBar({
  ids,
  onClear,
}: {
  ids: number[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SaleStatus | "">("");
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");

  // 하나라도 채워져 있어야 적용 가능.
  const patch: BulkProductPatch = {};
  if (status !== "") patch.saleStatus = status;
  if (stock !== "" && Number.isFinite(Number(stock))) {
    patch.stockQuantity = Number(stock);
  }
  if (price !== "" && Number.isFinite(Number(price))) {
    patch.salePrice = Number(price);
  }
  const dirtyCount = Object.keys(patch).length;

  function applyAll() {
    if (dirtyCount === 0) return;
    startTransition(async () => {
      try {
        const result = await bulkUpdateProducts(ids, patch);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        const parts = [
          patch.saleStatus && `상태 → ${SALE_STATUS_LABEL[patch.saleStatus]}`,
          patch.salePrice !== undefined &&
            `판매가 → ₩${patch.salePrice.toLocaleString()}`,
          patch.stockQuantity !== undefined &&
            `재고 → ${patch.stockQuantity}`,
        ].filter(Boolean);
        toast.success(
          `${result.data.updated}개 상품 일괄 수정 (${parts.join(" · ")})`,
        );
        setStatus("");
        setStock("");
        setPrice("");
        router.refresh();
        onClear();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "변경에 실패했습니다.",
        );
      }
    });
  }

  const fieldLabel = "text-[11px] font-medium text-muted-foreground";

  return (
    <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card px-4 py-3 shadow-elevated">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <span className="pb-2 text-sm font-bold text-foreground">
            {ids.length}개 선택
          </span>

          <div className="space-y-0.5">
            <p className={fieldLabel}>판매 상태</p>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as SaleStatus)}
            >
              <SelectTrigger className="h-9 w-28">
                <SelectValue placeholder="그대로" />
              </SelectTrigger>
              <SelectContent>
                {SALE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SALE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-0.5">
            <p className={fieldLabel}>판매가</p>
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="그대로"
              className="h-9 w-24"
            />
          </div>

          <div className="space-y-0.5">
            <p className={fieldLabel}>재고</p>
            <Input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="그대로"
              className="h-9 w-20"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5 pb-0.5">
            <Button
              size="sm"
              disabled={pending || dirtyCount === 0}
              onClick={applyAll}
            >
              {pending
                ? "적용 중…"
                : dirtyCount > 0
                  ? `${dirtyCount}개 항목 일괄 적용`
                  : "일괄 적용"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear} disabled={pending}>
              선택 해제
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          비워둔 항목은 바뀌지 않아요 — 채운 항목만 선택 상품 전체에 적용됩니다.
        </p>
      </div>
    </div>
  );
}
