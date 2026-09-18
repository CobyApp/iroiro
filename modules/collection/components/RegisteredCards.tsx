"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImageOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import type { CollectionCard } from "../types";
import { reorderItems, unregisterItem } from "../actions";

type Props = {
  collectionId: number;
  cards: Array<Omit<CollectionCard, "productThumbnailKey"> & { productThumbnailUrl: string | null }>;
};

// 등록 카드 관리 — 위/아래 이동(전체 순서 배열을 1..N로 재전송)과 등록 해제.
export function RegisteredCards({ collectionId, cards }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  function move(index: number, delta: -1 | 1) {
    const next = cards.map((c) => c.productId);
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    run(() => reorderItems({ collectionId, orderedProductIds: next }));
  }

  if (cards.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        아직 등록된 카드가 없습니다. 아래 보유 카드에서 등록해보세요.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {cards.map((card, index) => (
        <li
          key={card.id}
          className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
        >
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xs bg-muted">
            {card.productThumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.productThumbnailUrl}
                alt={card.productName}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-4 w-4" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{card.productName}</p>
            {card.quantity > 1 && (
              <p className="text-xs text-muted-foreground">×{card.quantity}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="위로"
              disabled={pending || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="아래로"
              disabled={pending || index === cards.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="등록 해제"
              disabled={pending}
              onClick={() =>
                run(() =>
                  unregisterItem({ collectionId, productId: card.productId }),
                )
              }
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
