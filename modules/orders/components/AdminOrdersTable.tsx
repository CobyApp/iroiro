"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatKstDateTime } from "@/lib/datetime";
import { advanceOrderStatus } from "../actions";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { AdminOrderRow } from "../lib/admin-queries";

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}

export function AdminOrdersTable({ orders }: { orders: AdminOrderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function advance(orderNo: string) {
    startTransition(async () => {
      const result = await advanceOrderStatus({ orderNo });
      if (!result.ok) {
        toast.error(result.message);
        router.refresh();
        return;
      }
      toast.success(
        result.data.status === "shipped"
          ? "발송 처리했어요 (구매자에게 알림 발송)"
          : "배송 완료 처리했어요 (구매자에게 알림 발송)",
      );
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        조건에 맞는 주문이 없습니다
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">주문번호</th>
            <th className="px-4 py-2.5 font-medium">상품</th>
            <th className="px-4 py-2.5 font-medium">구매자 / 수령인</th>
            <th className="px-4 py-2.5 text-right font-medium">결제 금액</th>
            <th className="px-4 py-2.5 font-medium">상태</th>
            <th className="px-4 py-2.5 font-medium">주문일시</th>
            <th className="px-4 py-2.5 font-medium">처리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="px-4 py-2.5 font-mono text-xs">{order.orderNo}</td>
              <td className="max-w-[220px] px-4 py-2.5">
                <span className="line-clamp-1">
                  {order.firstItemName ?? "—"}
                  {order.itemCount > 1 && (
                    <span className="text-muted-foreground">
                      {" "}
                      외 {order.itemCount - 1}건
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2.5">
                {order.buyerName}
                {order.recipientName && order.recipientName !== order.buyerName && (
                  <span className="text-muted-foreground">
                    {" "}
                    / {order.recipientName}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                {formatWon(order.totalAmount)}
                {order.discountAmount > 0 && (
                  <span className="block text-[11px] text-muted-foreground">
                    포인트 -{formatWon(order.discountAmount)}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {formatKstDateTime(order.createdAt)}
              </td>
              <td className="px-4 py-2.5">
                {order.status === "paid" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => advance(order.orderNo)}
                    disabled={pending}
                  >
                    <Truck className="h-3.5 w-3.5" />
                    발송 처리
                  </Button>
                )}
                {order.status === "shipped" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => advance(order.orderNo)}
                    disabled={pending}
                  >
                    <PackageCheck className="h-3.5 w-3.5" />
                    배송 완료
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
