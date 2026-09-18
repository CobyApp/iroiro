"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkUpdateProducts } from "../actions";
import {
  SALE_STATUSES,
  SALE_STATUS_LABEL,
  type ProductWithPhotos,
  type SaleStatus,
} from "../types";

// 목록에서 바로 여는 개별 빠른 수정 — 상태·판매가·재고만.
// 나머지 필드는 행 클릭(상세 수정 폼)으로.
export function QuickEditPopover({ product }: { product: ProductWithPhotos }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SaleStatus>(product.saleStatus);
  const [price, setPrice] = useState(String(product.salePrice));
  const [stock, setStock] = useState(String(product.stockQuantity));

  function save() {
    const patch: {
      saleStatus?: SaleStatus;
      salePrice?: number;
      stockQuantity?: number;
    } = {};
    if (status !== product.saleStatus) patch.saleStatus = status;
    const priceNum = Number(price);
    if (Number.isFinite(priceNum) && priceNum !== product.salePrice) {
      patch.salePrice = priceNum;
    }
    const stockNum = Number(stock);
    if (Number.isFinite(stockNum) && stockNum !== product.stockQuantity) {
      patch.stockQuantity = stockNum;
    }
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateProducts([product.id], patch);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("수정했어요");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={`${product.name} 빠른 수정`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-2.5 p-3">
        <p className="line-clamp-1 text-xs font-medium text-muted-foreground">
          {product.name}
        </p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">판매 상태</label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as SaleStatus)}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
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
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">판매가</label>
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">재고</label>
            <Input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <Button size="sm" className="w-full" disabled={pending} onClick={save}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
