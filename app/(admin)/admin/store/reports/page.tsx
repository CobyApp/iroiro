import type { Metadata } from "next";
import { Download } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { getSalesReport } from "@/modules/orders/lib/sales-report";
import { SalesReportView } from "@/modules/orders/components/SalesReportView";

export const metadata: Metadata = { title: "매출 리포트" };

// 스토어·배송 공간의 매출 리포트 — 접근 통제는 store 레이아웃(delivery 권한)이 담당한다.
export default async function AdminSalesReportPage() {
  const report = await getSalesReport(30);
  return (
    <AdminPage>
      <AdminPageHeader
        title="매출 리포트"
        description="최근 30일 결제 완료 기준 매출·주문·인기 상품이에요."
      >
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href="/admin/store/reports/export" download>
            <Download className="h-4 w-4" />
            CSV 내보내기
          </a>
        </Button>
      </AdminPageHeader>
      <SalesReportView report={report} />
    </AdminPage>
  );
}
