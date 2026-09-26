import { requireDeliveryManager } from "@/modules/admin/lib/requireAdminSpace";
import { listOrdersForAdmin } from "@/modules/orders/lib/admin-queries";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/modules/orders/types";
import { courierLabel } from "@/lib/shipping/couriers";
import { formatKstDateTime, todayKstYmd } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 주문 CSV 내보내기 — 상태 필터를 반영. 스토어(delivery) 권한 필수(라우트 자체 가드).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireDeliveryManager();
  } catch {
    return new Response("forbidden", { status: 403 });
  }

  const statusRaw = new URL(request.url).searchParams.get("status") ?? "";
  const status: OrderStatus | undefined = (
    ORDER_STATUSES as readonly string[]
  ).includes(statusRaw)
    ? (statusRaw as OrderStatus)
    : undefined;

  const { items } = await listOrdersForAdmin(status, 1, 5000);
  const header = [
    "주문번호",
    "상태",
    "구매자",
    "수령인",
    "대표상품",
    "상품수",
    "결제금액",
    "택배사",
    "송장번호",
    "주문일시",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const o of items) {
    lines.push(
      [
        o.orderNo,
        ORDER_STATUS_LABEL[o.status] ?? o.status,
        o.buyerName,
        o.recipientName ?? "",
        o.firstItemName ?? "",
        o.itemCount,
        o.totalAmount,
        o.courier ? courierLabel(o.courier) : "",
        o.trackingCode ?? "",
        formatKstDateTime(o.createdAt),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const suffix = status ? `-${status}` : "";
  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="iroiro-orders${suffix}-${todayKstYmd()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
