import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKstDateTime } from "@/lib/datetime";
import { trackingPageUrl } from "@/lib/korea-post";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";
import { OrderItemReviewButton } from "@/modules/reviews/components/OrderItemReviewButton";
import { canReviewOrderStatus } from "@/modules/reviews/lib/rules";
import type { MyOrderReview } from "@/modules/reviews/lib/queries";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PAYMENT_STATUS_LABEL, type OrderDetail as OrderDetailType } from "../types";

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}

export function OrderDetail({
  order,
  myReviews = [],
}: {
  order: OrderDetailType;
  /** 이 주문에서 내가 이미 남긴 리뷰 — 상품별 쓰기/수정 버튼 분기용. */
  myReviews?: MyOrderReview[];
}) {
  const reviewable = canReviewOrderStatus(order.status);
  const reviewByProduct = new Map(myReviews.map((r) => [r.productId, r]));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl">주문 상세</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {order.orderNo} · {formatKstDateTime(order.createdAt)}
          </p>
        </div>
      </div>

      {order.status === "pending" && (
        <Card className="border-primary/40">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <p className="text-sm">결제가 완료되지 않은 주문입니다.</p>
            <Button asChild size="sm">
              <Link href={`/checkout/${order.orderNo}/pay`}>결제 계속하기</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>주문 상품</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xs bg-muted">
                {item.productThumbnailKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={productGridThumbnailUrl(item.productId)}
                    alt={item.productName}
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
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.productName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatWon(item.unitPrice)} · {item.quantity}개
                  </p>
                  {reviewable && (
                    <div className="mt-1.5">
                      <OrderItemReviewButton
                        orderId={order.id}
                        productId={item.productId}
                        productName={item.productName}
                        existing={reviewByProduct.get(item.productId)}
                      />
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {formatWon(item.unitPrice * item.quantity)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {order.trackingCode && (
        <Card>
          <CardHeader>
            <CardTitle>배송 조회</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              등기번호{" "}
              <span className="font-medium text-foreground">
                {order.trackingCode}
              </span>
            </p>
            <a
              href={trackingPageUrl(order.trackingCode)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
            >
              우체국 배송 조회 →
            </a>
          </CardContent>
        </Card>
      )}

      {order.address && (
        <Card>
          <CardHeader>
            <CardTitle>배송지</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">
              {order.address.recipientName} · {order.address.recipientPhone}
            </p>
            <p className="text-muted-foreground">
              [{order.address.zipcode}] {order.address.baseAddress}
              {order.address.detailAddress
                ? ` ${order.address.detailAddress}`
                : ""}
            </p>
            {order.address.deliveryMessage && (
              <p className="text-muted-foreground">
                요청사항: {order.address.deliveryMessage}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>결제 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {order.payment && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">결제 상태</span>
              <span>{PAYMENT_STATUS_LABEL[order.payment.status]}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">상품 합계</span>
            <span>{formatWon(order.productAmount)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">할인</span>
              <span>-{formatWon(order.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">배송비</span>
            <span>
              {order.deliveryAmount === 0
                ? "무료"
                : formatWon(order.deliveryAmount)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>총 결제 금액</span>
            <span>{formatWon(order.totalAmount)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
