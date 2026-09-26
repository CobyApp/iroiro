import type { Metadata } from "next";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
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
      />
      <SalesReportView report={report} />
    </AdminPage>
  );
}
