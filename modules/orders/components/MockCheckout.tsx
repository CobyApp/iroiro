"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cancelOrder, confirmPayment } from "../actions";

type Props = {
  orderNo: string;
  totalAmount: number;
  // dev(mock)에서만 "실패 테스트" 노출.
  allowFailTest: boolean;
};

export function MockCheckout({ orderNo, totalAmount, allowFailTest }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pay(tradeNo?: string) {
    startTransition(async () => {
      const result = await confirmPayment({ orderNo, tradeNo: tradeNo ?? null });
      if (!result.ok) {
        toast.error(result.message);
        router.refresh();
        return;
      }
      router.push(`/orders/${orderNo}/complete`);
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelOrder({ orderNo });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.info("주문을 취소했습니다");
      router.push("/");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>결제</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-xs bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          모의 결제 화면입니다. 실제 PG 연동 시 이 자리에 결제 위젯이 표시됩니다.
        </p>
        <div className="flex justify-between text-base font-bold">
          <span>결제 금액</span>
          <span>₩{totalAmount.toLocaleString()}</span>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => pay()}
        >
          {pending ? "처리 중..." : "결제하기"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={cancel}
        >
          주문 취소
        </Button>
        {allowFailTest && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            disabled={pending}
            onClick={() => pay("mock_fail")}
          >
            실패 테스트 (dev)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
