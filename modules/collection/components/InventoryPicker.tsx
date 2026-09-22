"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InventoryEntry } from "../types";
import { registerItem, unregisterItem } from "../actions";

type Props = {
  collectionId: number;
  entries: Array<Omit<InventoryEntry, "productThumbnailKey"> & { productThumbnailUrl: string | null }>;
  registeredProductIds: number[];
};

// 보유 카드 목록(인벤토리 피커) — 이 컬렉션에 등록/해제 토글.
export function InventoryPicker({
  collectionId,
  entries,
  registeredProductIds,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const registered = new Set(registeredProductIds);

  function toggle(productId: number, isRegistered: boolean) {
    startTransition(async () => {
      const result = isRegistered
        ? await unregisterItem({ collectionId, productId })
        : await registerItem({ collectionId, productId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        보유한 카드가 없습니다. 구매한 카드가 결제 완료되면 여기에 표시됩니다.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
      {entries.map((entry) => {
        const isRegistered = registered.has(entry.productId);
        return (
          <div key={entry.productId} className="space-y-1.5">
            <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-muted">
              {entry.productThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.productThumbnailUrl}
                  alt={entry.productName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-5 w-5" aria-hidden />
                </div>
              )}
              {entry.quantity > 1 && (
                <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
                  ×{entry.quantity}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {entry.productName}
            </p>
            <Button
              size="sm"
              variant={isRegistered ? "outline" : "default"}
              className="w-full"
              disabled={pending}
              onClick={() => toggle(entry.productId, isRegistered)}
            >
              {isRegistered ? "해제" : "등록"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
