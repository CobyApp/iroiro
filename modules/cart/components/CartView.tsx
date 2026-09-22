"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action-result";
import { calculateOrderAmounts } from "@/modules/orders/lib/amounts";
import { removeCartItem, updateCartItemQuantity } from "../actions";

export type CartLineView = {
  cartItemId: number;
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  stockQuantity: number;
  available: boolean;
  thumbnailUrl: string | null;
};

type Policy = {
  deliveryFee: number;
  freeThresholdAmount: number | null;
};

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}

export function CartView({
  lines,
  policy,
}: {
  lines: CartLineView[];
  policy: Policy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 선택 상태 — 기본은 구매 가능한 항목 전체 선택. 구매 불가 항목은 선택 불가.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(lines.filter((l) => l.available).map((l) => l.cartItemId)),
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const availableLines = lines.filter((l) => l.available);
  const allSelected =
    availableLines.length > 0 &&
    availableLines.every((l) => selected.has(l.cartItemId));
  function toggleAll() {
    setSelected(
      allSelected
        ? new Set()
        : new Set(availableLines.map((l) => l.cartItemId)),
    );
  }

  // 선택 항목 기준 금액 — 서버와 같은 순수 함수로 계산(최종 검증은 결제 시 서버).
  const selectedLines = availableLines.filter((l) => selected.has(l.cartItemId));
  const summary = calculateOrderAmounts(
    selectedLines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })),
    policy,
  );
  const remainingForFree =
    policy.freeThresholdAmount !== null && summary.deliveryAmount > 0
      ? policy.freeThresholdAmount - summary.productAmount
      : 0;

  function goCheckout() {
    if (selectedLines.length === 0) {
      toast.error("주문할 상품을 선택해주세요");
      return;
    }
    const ids = selectedLines.map((l) => l.cartItemId).join(",");
    router.push(`/checkout?items=${ids}`);
  }

  function runCartAction(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        {/* 전체 선택 — 구매 가능한 항목만 대상. */}
        {availableLines.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 px-1 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            전체 선택 ({selectedLines.length}/{availableLines.length})
          </label>
        )}
        <ul className="space-y-3">
        {lines.map((line) => (
          <li key={line.cartItemId}>
            <Card>
              <CardContent className="flex gap-4 p-4">
                <input
                  type="checkbox"
                  checked={selected.has(line.cartItemId)}
                  onChange={() => toggle(line.cartItemId)}
                  disabled={!line.available}
                  aria-label={`${line.name} 선택`}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                />
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xs border border-border bg-muted shadow-card">
                  {line.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.thumbnailUrl}
                      alt={line.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-5 w-5" aria-hidden />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="space-y-1">
                    <Link
                      href={`/products/${line.productId}`}
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {line.name}
                    </Link>
                    <p className="text-sm font-semibold text-primary">
                      {formatWon(line.unitPrice)}
                    </p>
                    {!line.available && (
                      <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        구매할 수 없는 상품입니다 — 삭제해주세요
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center rounded-full border border-border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={
                          pending || !line.available || line.quantity <= 1
                        }
                        aria-label="수량 감소"
                        onClick={() =>
                          runCartAction(() =>
                            updateCartItemQuantity({
                              cartItemId: line.cartItemId,
                              quantity: line.quantity - 1,
                            }),
                          )
                        }
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-9 text-center text-sm font-medium tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={
                          pending ||
                          !line.available ||
                          line.quantity >= line.stockQuantity
                        }
                        aria-label="수량 증가"
                        onClick={() =>
                          runCartAction(() =>
                            updateCartItemQuantity({
                              cartItemId: line.cartItemId,
                              quantity: line.quantity + 1,
                            }),
                          )
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      disabled={pending}
                      aria-label="삭제"
                      onClick={() =>
                        runCartAction(() =>
                          removeCartItem({ cartItemId: line.cartItemId }),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
        </ul>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-display text-lg">결제 예상 금액</h2>
            {remainingForFree > 0 && (
              <p className="rounded-full border border-border bg-cyan/20 px-3 py-2 text-center text-xs font-medium shadow-card">
                🚚 {formatWon(remainingForFree)} 더 담으면 무료 배송!
              </p>
            )}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">상품 합계</dt>
                <dd>{formatWon(summary.productAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">배송비</dt>
                <dd>
                  {summary.deliveryAmount === 0
                    ? "무료"
                    : formatWon(summary.deliveryAmount)}
                </dd>
              </div>
              <div className="flex justify-between border-t-2 border-border pt-2 text-base font-semibold">
                <dt>결제 예정</dt>
                <dd className="text-primary">
                  {formatWon(summary.totalAmount)}
                </dd>
              </div>
            </dl>

            {selectedLines.length === 0 && (
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                주문할 상품을 선택해주세요
              </p>
            )}

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={pending || selectedLines.length === 0}
              onClick={goCheckout}
            >
              주문하기 ({selectedLines.length})
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
