import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatKstDate } from "@/lib/datetime";
import {
  collectionThumbnailUrl,
  productGridThumbnailUrl,
} from "@/modules/products/lib/customer-media";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { OrderSummary } from "../types";

// 결제 완료 이후(보유 확정) 주문은 워터마크 없는 소유자 이미지(clean)를 쓴다.
function isOwnedStatus(status: OrderSummary["status"]): boolean {
  return status === "paid" || status === "shipped" || status === "delivered";
}

export function OrderList({ orders }: { orders: OrderSummary[] }) {
  return (
    <ul className="space-y-3">
      {orders.map((order) => {
        const productId = order.firstItemProductId;
        const thumbUrl =
          order.firstItemThumbnailKey && productId !== null
            ? isOwnedStatus(order.status)
              ? collectionThumbnailUrl(productId)
              : productGridThumbnailUrl(productId)
            : null;
        return (
          <li key={order.id}>
            <Link href={`/orders/${order.orderNo}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xs bg-muted">
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl}
                        alt={order.firstItemName ?? "주문 상품"}
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
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatKstDate(order.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium">
                      {order.firstItemName ?? "주문 상품"}
                      {order.itemCount > 1 ? ` 외 ${order.itemCount - 1}건` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.orderNo}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold">
                    ₩{order.totalAmount.toLocaleString()}
                  </span>
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
