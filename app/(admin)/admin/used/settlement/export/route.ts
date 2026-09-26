import { requireUsedManager } from "@/modules/admin/lib/requireAdminSpace";
import { getUsedSettlementReport } from "@/modules/used/lib/settlement";
import { todayKstYmd } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 중고 정산 CSV — 중고(used) 권한 필수(라우트 자체 가드).
export async function GET(): Promise<Response> {
  try {
    await requireUsedManager();
  } catch {
    return new Response("forbidden", { status: 403 });
  }

  const report = await getUsedSettlementReport(30);
  const lines = [["판매자", "완료거래", "수수료(원)", "정산지급액(원)"].map(csvCell).join(",")];
  for (const r of report.rows) {
    lines.push(
      [r.sellerName, r.tradeCount, r.feeTotal, r.payoutTotal].map(csvCell).join(","),
    );
  }
  lines.push("");
  lines.push(
    ["합계", report.tradeCount, report.feeTotal, report.payoutTotal].map(csvCell).join(","),
  );

  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="iroiro-settlement-${todayKstYmd()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
