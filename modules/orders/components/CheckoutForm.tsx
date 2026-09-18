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
import { Textarea } from "@/components/ui/textarea";
import { placeOrder } from "../actions";
import { PostcodeSearchField } from "./PostcodeSearchField";

type OrderSummary = {
  productAmount: number;
  deliveryAmount: number;
  totalAmount: number;
};

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}

export function CheckoutForm({
  summary,
  pointBalance = 0,
  freeShippingCoupons = 0,
  defaultAddress = null,
}: {
  summary: OrderSummary;
  pointBalance?: number;
  freeShippingCoupons?: number;
  /** 주소록의 기본 배송지 — 있으면 배송지 입력을 미리 채운다. */
  defaultAddress?: {
    recipientName: string;
    recipientPhone: string;
    zipcode: string;
    baseAddress: string;
    detailAddress: string | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recipientName, setRecipientName] = useState(
    defaultAddress?.recipientName ?? "",
  );
  const [recipientPhone, setRecipientPhone] = useState(
    defaultAddress?.recipientPhone ?? "",
  );
  const [zipcode, setZipcode] = useState(defaultAddress?.zipcode ?? "");
  const [baseAddress, setBaseAddress] = useState(
    defaultAddress?.baseAddress ?? "",
  );
  const [detailAddress, setDetailAddress] = useState(
    defaultAddress?.detailAddress ?? "",
  );
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [pointsInput, setPointsInput] = useState("0");
  const [useCoupon, setUseCoupon] = useState(false);

  // 서버와 같은 규칙으로 표시 금액을 계산 — 최종 검증은 서버(placeOrder)가 한다.
  const maxPoints = Math.max(0, Math.min(pointBalance, summary.productAmount));
  const usePoints = Math.max(
    0,
    Math.min(Number(pointsInput.replace(/[^0-9]/g, "")) || 0, maxPoints),
  );
  const couponApplies = useCoupon && summary.deliveryAmount > 0;
  const deliveryAmount = couponApplies ? 0 : summary.deliveryAmount;
  const totalAmount = summary.productAmount - usePoints + deliveryAmount;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipientName.trim()) {
      toast.error("수령인을 입력해주세요");
      return;
    }
    if (!recipientPhone.trim()) {
      toast.error("연락처를 입력해주세요");
      return;
    }
    if (!zipcode || !baseAddress) {
      toast.error("우편번호 검색으로 주소를 입력해주세요");
      return;
    }

    startTransition(async () => {
      const result = await placeOrder({
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        zipcode,
        baseAddress,
        detailAddress: detailAddress.trim() || null,
        deliveryMessage: deliveryMessage.trim() || null,
        expectedTotalAmount: totalAmount,
        usePoints,
        useFreeShippingCoupon: couponApplies,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.push(`/checkout/${result.data.orderNo}/pay`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>배송지</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recipientName">수령인</Label>
            <Input
              id="recipientName"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              maxLength={50}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipientPhone">연락처</Label>
            <Input
              id="recipientPhone"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              maxLength={20}
              inputMode="tel"
              autoComplete="tel"
              placeholder="010-0000-0000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zipcode">주소</Label>
            <div className="flex gap-2">
              <Input
                id="zipcode"
                value={zipcode}
                readOnly
                placeholder="우편번호"
                className="w-32"
              />
              <PostcodeSearchField
                onComplete={(result) => {
                  setZipcode(result.zipcode);
                  setBaseAddress(result.baseAddress);
                }}
              />
            </div>
            <Input value={baseAddress} readOnly placeholder="기본 주소" />
            <Input
              value={detailAddress}
              onChange={(e) => setDetailAddress(e.target.value)}
              maxLength={200}
              placeholder="상세 주소 (동·호수 등)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deliveryMessage">배송 요청사항</Label>
            <Textarea
              id="deliveryMessage"
              value={deliveryMessage}
              onChange={(e) => setDeliveryMessage(e.target.value)}
              maxLength={200}
              placeholder="예: 부재 시 문 앞에 놓아주세요"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {(pointBalance > 0 || freeShippingCoupons > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>포인트·쿠폰</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pointBalance > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="usePoints">
                  포인트 사용{" "}
                  <span className="font-normal text-muted-foreground">
                    (보유 {formatWon(pointBalance)})
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="usePoints"
                    inputMode="numeric"
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    onBlur={() => setPointsInput(String(usePoints))}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPointsInput(String(maxPoints))}
                    disabled={pending}
                  >
                    전액 사용
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  상품 금액까지 사용할 수 있어요 (최대 {formatWon(maxPoints)})
                </p>
              </div>
            )}
            {freeShippingCoupons > 0 && (
              <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <span className="text-sm">
                  무료배송 쿠폰{" "}
                  <span className="text-xs text-muted-foreground">
                    ({freeShippingCoupons}장 보유)
                  </span>
                  {summary.deliveryAmount === 0 && (
                    <span className="block text-xs text-muted-foreground">
                      이미 무료배송이라 쓸 필요 없어요
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={useCoupon}
                  onChange={(e) => setUseCoupon(e.target.checked)}
                  disabled={pending || summary.deliveryAmount === 0}
                  className="h-4 w-4 accent-primary"
                  aria-label="무료배송 쿠폰 사용"
                />
              </label>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>결제 금액</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">상품 합계</dt>
              <dd>{formatWon(summary.productAmount)}</dd>
            </div>
            {usePoints > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">포인트 할인</dt>
                <dd className="text-primary">-{formatWon(usePoints)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">배송비</dt>
              <dd>
                {deliveryAmount === 0 ? (
                  couponApplies ? (
                    <span>
                      <s className="mr-1 text-muted-foreground">
                        {formatWon(summary.deliveryAmount)}
                      </s>
                      무료 (쿠폰)
                    </span>
                  ) : (
                    "무료"
                  )
                ) : (
                  formatWon(deliveryAmount)
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>결제 예정</dt>
              <dd>{formatWon(totalAmount)}</dd>
            </div>
          </dl>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={pending}
          >
            {pending ? "주문 생성 중..." : "결제하기"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
