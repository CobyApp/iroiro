"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todayKstYmd } from "@/lib/datetime";
import type { PurchaserSettlement } from "@/modules/products/lib/settlement";

const HEADER = [
  "매입자",
  "상품 수",
  "재고",
  "총원가",
  "총 판매가",
  "예상 이익",
  "마진율(%)",
];

function toRow(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const s = String(c);
      // 콤마·따옴표·개행 포함 시 큰따옴표로 감싸고 내부 따옴표 이스케이프.
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

// 매입자별 정산 CSV 내보내기 — Excel 한글 대비 UTF-8 BOM.
export function SettlementExport({ rows }: { rows: PurchaserSettlement[] }) {
  function download() {
    const lines = [toRow(HEADER)];
    for (const r of rows) {
      lines.push(
        toRow([
          r.purchaser ?? "미지정",
          r.productCount,
          r.totalStock,
          r.totalCost,
          r.totalSalePrice,
          r.profit,
          r.marginRate,
        ]),
      );
    }
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement-${todayKstYmd()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={download}
      disabled={rows.length === 0}
    >
      <Download className="h-4 w-4" />
      CSV 내보내기
    </Button>
  );
}
