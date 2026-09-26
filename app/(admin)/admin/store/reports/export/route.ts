import { requireDeliveryManager } from "@/modules/admin/lib/requireAdminSpace";
import { getSalesReport } from "@/modules/orders/lib/sales-report";
import { todayKstYmd } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 매출 리포트 CSV 내보내기 — 스토어(delivery) 권한 필수. 라우트 핸들러는 레이아웃 가드 밖이라
// 여기서 직접 권한을 검증한다. 엑셀 한글 깨짐 방지를 위해 UTF-8 BOM 을 앞에 붙인다.
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(): Promise<Response> {
  try {
    await requireDeliveryManager();
  } catch {
    return new Response("forbidden", { status: 403 });
  }

  const report = await getSalesReport(30);
  const lines: string[] = [];
  lines.push(["날짜", "매출(원)", "주문수"].map(csvCell).join(","));
  for (const d of report.daily) {
    lines.push([d.date, d.sales, d.orders].map(csvCell).join(","));
  }
  lines.push("");
  lines.push(["합계", report.totalSales, report.totalOrders].map(csvCell).join(","));
  lines.push(["객단가", report.avgOrderValue, ""].map(csvCell).join(","));
  lines.push("");
  lines.push(["인기상품", "수량", "매출(원)"].map(csvCell).join(","));
  for (const p of report.topProducts) {
    lines.push([p.name, p.quantity, p.revenue].map(csvCell).join(","));
  }

  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="iroiro-sales-${todayKstYmd()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
