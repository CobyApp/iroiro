"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action-result";
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

type Summary = {
  productAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  freeThresholdAmount: number | null;
};

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}

export function CartView({
  lines,
  summary,
}: {
  lines: CartLineView[];
  summary: Summary;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const hasUnavailable = lines.some((line) => !line.available);
  const remainingForFree =
    summary.freeThresholdAmount !== null && summary.deliveryAmount > 0
      ? summary.freeThresholdAmount - summary.productAmount
      : 0;

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
      <ul className="space-y-3">
        {lines.map((line) => (
          <li key={line.cartItemId}>
            <Card>
              <CardContent className="flex gap-4 p-4">
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

            {hasUnavailable && (
              <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                구매 불가 상품을 삭제한 뒤 주문할 수 있어요
              </p>
            )}

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={pending || hasUnavailable || lines.length === 0}
              onClick={() => router.push("/checkout")}
            >
              주문하기
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
