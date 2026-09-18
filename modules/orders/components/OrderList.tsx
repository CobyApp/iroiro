import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatKstDate } from "@/lib/datetime";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { OrderSummary } from "../types";

export function OrderList({ orders }: { orders: OrderSummary[] }) {
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <Link href={`/orders/${order.orderNo}`}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
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
      ))}
    </ul>
  );
}
