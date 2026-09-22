import type { Metadata } from "next";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listUsedReviewReportQueue } from "@/modules/used/lib/review-report";
import { UsedReviewReportQueue } from "@/modules/used/components/UsedReviewReportQueue";

export const metadata: Metadata = { title: "후기 신고" };

// 중고 거래 후기 신고 큐 — 미해결 신고를 오래된 순으로. 숨김·기각으로 처리한다.
export default async function MarketReviewReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const queue = await listUsedReviewReportQueue(page);

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        title="후기 신고"
        count={queue.total}
        description="접수된 중고 거래 후기 신고를 숨김·기각으로 처리해요. 숨김은 나중에 해제할 수 있어요."
      />
      <UsedReviewReportQueue
        items={queue.items}
        total={queue.total}
        page={queue.page}
        pageSize={queue.pageSize}
      />
    </AdminPage>
  );
}
