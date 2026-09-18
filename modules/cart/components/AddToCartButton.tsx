"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginPromptDialog } from "@/modules/auth/components/LoginPromptDialog";
import { addCartItem } from "../actions";

type Props = {
  productId: number;
  stockQuantity: number;
  isLoggedIn: boolean;
  /** 상품 도메인에서 주입하는 보조 CTA(상세의 찜하기 등). */
  leadingAction?: ReactNode;
};

export function AddToCartButton({
  productId,
  stockQuantity,
  isLoggedIn,
  leadingAction,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState(1);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  function handleAdd() {
    if (!isLoggedIn) {
      setLoginPromptOpen(true);
      return;
    }
    startTransition(async () => {
      const result = await addCartItem({ productId, quantity });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh(); // 헤더 장바구니 뱃지 갱신
      toast.success("장바구니에 담았습니다", {
        action: { label: "장바구니 보기", onClick: () => router.push("/cart") },
      });
    });
  }

  // 바로구매 — 장바구니에 담은 뒤 곧장 결제로(낙찰 결제와 같은 동선).
  function handleBuyNow() {
    if (!isLoggedIn) {
      setLoginPromptOpen(true);
      return;
    }
    startTransition(async () => {
      const result = await addCartItem({ productId, quantity });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.push("/checkout");
    });
  }

  return (
    <>
      <div className="space-y-3">
        {stockQuantity > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">수량</span>
            <div className="flex items-center rounded-sm border border-border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={pending || quantity <= 1}
                aria-label="수량 감소"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-medium tabular-nums">
                {quantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() =>
                  setQuantity((q) => Math.min(stockQuantity, q + 1))
                }
                disabled={pending || quantity >= stockQuantity}
                aria-label="수량 증가"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-stretch gap-2">
          {leadingAction}
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-w-0 flex-1"
            onClick={handleAdd}
            disabled={pending || stockQuantity === 0}
          >
            <ShoppingBag className="h-5 w-5" />
            {stockQuantity === 0
              ? "품절"
              : pending
                ? "담는 중..."
                : "장바구니"}
          </Button>
          {stockQuantity > 0 && (
            <Button
              type="button"
              size="lg"
              className="min-w-0 flex-1"
              onClick={handleBuyNow}
              disabled={pending}
            >
              바로구매
            </Button>
          )}
        </div>
      </div>
      <LoginPromptDialog
        feature="cart"
        open={loginPromptOpen}
        onOpenChange={setLoginPromptOpen}
      />
    </>
  );
}
