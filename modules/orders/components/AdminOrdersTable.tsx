"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKstDateTime } from "@/lib/datetime";
import { advanceOrderStatus } from "../actions";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { AdminOrderRow } from "../lib/admin-queries";

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}

// 관리자 주문 목록 — md+ 는 표, 폰은 카드(주문번호·상품·금액·상태·처리 버튼을 세로로 쌓는다).
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
      <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        조건에 맞는 주문이 없습니다
      </p>
    );
  }

  function actionSlot(order: AdminOrderRow) {
    if (order.status === "paid") {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => advance(order.orderNo)}
          disabled={pending}
        >
          <Truck className="h-3.5 w-3.5" />
          발송 처리
        </Button>
      );
    }
    if (order.status === "shipped") {
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => advance(order.orderNo)}
          disabled={pending}
        >
          <PackageCheck className="h-3.5 w-3.5" />
          배송 완료
        </Button>
      );
    }
    return null;
  }

  function itemLabel(order: AdminOrderRow) {
    return (
      <>
        {order.firstItemName ?? "—"}
        {order.itemCount > 1 && (
          <span className="text-muted-foreground"> 외 {order.itemCount - 1}건</span>
        )}
      </>
    );
  }

  function buyerLabel(order: AdminOrderRow) {
    return (
      <>
        {order.buyerName}
        {order.recipientName && order.recipientName !== order.buyerName && (
          <span className="text-muted-foreground"> / {order.recipientName}</span>
        )}
      </>
    );
  }

  return (
    <>
      {/* 데스크톱 — 표 */}
      <div className="hidden md:block">
        <Table className="min-w-[55rem]">
          <TableHeader>
            <TableRow>
              <TableHead>주문번호</TableHead>
              <TableHead>상품</TableHead>
              <TableHead>구매자 / 수령인</TableHead>
              <TableHead className="text-right">결제 금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>주문일시</TableHead>
              <TableHead>처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="py-2.5 font-mono text-xs">{order.orderNo}</TableCell>
                <TableCell className="max-w-[220px] py-2.5">
                  <span className="line-clamp-1">{itemLabel(order)}</span>
                </TableCell>
                <TableCell className="py-2.5">{buyerLabel(order)}</TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {formatWon(order.totalAmount)}
                  {order.discountAmount > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      포인트 -{formatWon(order.discountAmount)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2.5">
                  <OrderStatusBadge status={order.status} />
                  {order.trackingCode && (
                    <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                      등기 {order.trackingCode}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                  {formatKstDateTime(order.createdAt)}
                </TableCell>
                <TableCell className="py-2.5">{actionSlot(order)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 모바일 — 카드 리스트 */}
      <ul className="space-y-2 md:hidden">
        {orders.map((order) => {
          const action = actionSlot(order);
          return (
            <li
              key={order.id}
              className="space-y-2 rounded-md border border-border bg-card p-3 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {order.orderNo}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <OrderStatusBadge status={order.status} />
                  {order.trackingCode && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      등기 {order.trackingCode}
                    </span>
                  )}
                </div>
              </div>
              <p className="line-clamp-2 text-sm font-medium leading-snug">{itemLabel(order)}</p>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">{buyerLabel(order)}</span>
                <span className="font-medium tabular-nums">
                  {formatWon(order.totalAmount)}
                  {order.discountAmount > 0 && (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      (포인트 -{formatWon(order.discountAmount)})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatKstDateTime(order.createdAt)}
                </span>
                {action}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
