"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteProduct } from "../actions";
import { SALE_STATUS_LABEL, type SaleStatus } from "../types";
import type { DuplicateProductGroup } from "../lib/queries";

// 같은 카탈로그 카드로 중복 등록된 상품 그룹 정리 — 그룹마다 남길 하나만 두고 나머지를 삭제.
export function DuplicateProductsTable({
  groups,
  publicBaseUrl,
}: {
  groups: DuplicateProductGroup[];
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  function onDelete(id: number, name: string) {
    if (!window.confirm(`"${name}" 상품을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusyId(id);
    startTransition(async () => {
      const result = await deleteProduct(id);
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("삭제했어요");
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
        같은 카드로 중복 등록된 상품이 없어요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        같은 카탈로그 카드로 2개 이상 등록된 상품이에요. 그룹마다 하나만 남기고 나머지를 삭제하세요.
      </p>
      {groups.map((group) => (
        <div key={group.catalogCardId} className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            카드 #{group.catalogCardId} · {group.items.length}개 중복
          </div>
          <ul className="divide-y divide-border">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded border border-border bg-muted">
                  {item.thumbnailKey && (
                    /* eslint-disable-next-line @next/next/no-img-element -- 관리 목록 썸네일 */
                    <img
                      src={`${publicBaseUrl}/${item.thumbnailKey}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {SALE_STATUS_LABEL[item.saleStatus as SaleStatus] ?? item.saleStatus} · ₩
                    {item.salePrice.toLocaleString()} · 재고 {item.stockQuantity}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/delivery/products/${item.id}/edit`}>수정</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(item.id, item.name)}
                  disabled={pending && busyId === item.id}
                >
                  {pending && busyId === item.id ? "삭제 중…" : "삭제"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
