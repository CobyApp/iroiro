import type { Metadata } from "next";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listUsedReportQueue } from "@/modules/used/lib/report";
import { UsedReportQueue } from "@/modules/used/components/UsedReportQueue";

export const metadata: Metadata = { title: "신고" };

// 중고 매물 신고 큐 — 미해결 신고를 오래된 순으로. 차단·기각으로 처리한다.
export default async function MarketReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const queue = await listUsedReportQueue(page);

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader title="매물 신고" description="접수된 중고 매물 신고를 처리해요." />
      <UsedReportQueue
        items={queue.items}
        total={queue.total}
        page={queue.page}
        pageSize={queue.pageSize}
        publicBaseUrl={env.R2_PUBLIC_BASE}
      />
    </AdminPage>
  );
}
