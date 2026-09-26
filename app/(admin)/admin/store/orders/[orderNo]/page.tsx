import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKstDateTime } from "@/lib/datetime";
import { courierLabel, courierTrackingUrl } from "@/lib/shipping/couriers";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";
import { getAdminOrderDetail } from "@/modules/orders/lib/admin-queries";
import { OrderStatusBadge } from "@/modules/orders/components/OrderStatusBadge";
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
} from "@/modules/orders/types";

export const metadata = { title: "주문 상세" };

function won(n: number) {
  return `₩${n.toLocaleString()}`;
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  const order = await getAdminOrderDetail(orderNo);
  if (!order) notFound();

  const trackingUrl = order.trackingCode
    ? courierTrackingUrl(order.courier, order.trackingCode)
    : null;

  return (
    <AdminPage>
      <AdminPageHeader title={`주문 ${order.orderNo}`}>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/admin/store/orders">
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
        </Button>
      </AdminPageHeader>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <OrderStatusBadge status={order.status} />
        <span>{ORDER_STATUS_LABEL[order.status]}</span>
        <span aria-hidden>·</span>
        <span>{formatKstDateTime(order.createdAt)}</span>
        <span aria-hidden>·</span>
        <span>
          구매자{" "}
          <Link
            href={`/admin/users/${order.buyerAccountId}`}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {order.buyerName}
          </Link>
        </span>
      </div>

      {/* 주문 상품 — 이미지 포함 */}
      <Card>
        <CardHeader>
          <CardTitle>주문 상품 ({order.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <Link
                href={`/admin/store/products/${item.productId}/edit`}
                className="block h-16 w-16 shrink-0 overflow-hidden rounded-xs border border-border bg-muted"
                aria-label={`${item.productName} 상품 관리`}
              >
                {item.productThumbnailKey ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 관리자 썸네일(공개 wm)
                  <img
                    src={productGridThumbnailUrl(item.productId)}
                    alt={item.productName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/store/products/${item.productId}/edit`}
                  className="block truncate text-sm font-medium hover:text-primary hover:underline"
                >
                  {item.productName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {won(item.unitPrice)} · {item.quantity}개
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {won(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 배송지 */}
      {order.address && (
        <Card>
          <CardHeader>
            <CardTitle>배송지</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">
              {order.address.recipientName}{" "}
              <span className="text-muted-foreground">
                {order.address.recipientPhone}
              </span>
            </p>
            <p className="text-muted-foreground">
              ({order.address.zipcode}) {order.address.baseAddress}{" "}
              {order.address.detailAddress ?? ""}
            </p>
            {order.address.deliveryMessage && (
              <p className="text-muted-foreground">
                요청사항: {order.address.deliveryMessage}
              </p>
            )}
            {order.trackingCode && (
              <p className="pt-1 text-muted-foreground">
                {courierLabel(order.courier)}{" "}
                <span className="font-mono text-foreground">
                  {order.trackingCode}
                </span>
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-primary underline underline-offset-2"
                  >
                    배송 조회 →
                  </a>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 결제 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>결제 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">상품 금액</span>
            <span>{won(order.productAmount)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">포인트 사용</span>
              <span>-{won(order.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">배송비</span>
            <span>
              {order.deliveryAmount === 0 ? "무료" : won(order.deliveryAmount)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
            <span>결제 금액</span>
            <span className="text-primary">{won(order.totalAmount)}</span>
          </div>
          {order.payment && (
            <p className="pt-1 text-xs text-muted-foreground">
              {order.payment.provider}
              {order.payment.method ? ` · ${order.payment.method}` : ""} ·{" "}
              {PAYMENT_STATUS_LABEL[order.payment.status as PaymentStatus] ??
                order.payment.status}
              {order.payment.approvedAt
                ? ` · ${formatKstDateTime(order.payment.approvedAt)}`
                : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </AdminPage>
  );
}
