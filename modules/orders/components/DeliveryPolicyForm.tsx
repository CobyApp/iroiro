"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDeliveryPolicy } from "../actions";
import type { DeliveryPolicy } from "../types";

export function DeliveryPolicyForm({ policy }: { policy: DeliveryPolicy }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deliveryFee, setDeliveryFee] = useState(String(policy.deliveryFee));
  const [freeThreshold, setFreeThreshold] = useState(
    policy.freeThresholdAmount === null
      ? ""
      : String(policy.freeThresholdAmount),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fee = Number(deliveryFee);
    if (!Number.isInteger(fee) || fee < 0) {
      toast.error("배송비는 0 이상의 정수여야 합니다");
      return;
    }
    const threshold =
      freeThreshold.trim() === "" ? null : Number(freeThreshold);
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
      toast.error("무료 배송 기준은 0 이상의 정수여야 합니다");
      return;
    }

    startTransition(async () => {
      const result = await updateDeliveryPolicy({
        deliveryFee: fee,
        freeThresholdAmount: threshold,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("배송비 정책을 저장했습니다");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>배송비 정책</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deliveryFee">기본 배송비 (원)</Label>
            <Input
              id="deliveryFee"
              type="number"
              min={0}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="freeThreshold">무료 배송 기준 (원)</Label>
            <Input
              id="freeThreshold"
              type="number"
              min={0}
              value={freeThreshold}
              onChange={(e) => setFreeThreshold(e.target.value)}
              placeholder="비우면 무료 배송 제도 없음"
            />
            <p className="text-xs text-muted-foreground">
              상품 합계가 이 금액 이상이면 배송비가 무료입니다. 비워 두면 항상
              배송비를 부과합니다.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
