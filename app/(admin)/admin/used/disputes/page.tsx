import type { Metadata } from "next";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listUsedDisputeQueue } from "@/modules/used/lib/report";
import { UsedDisputeQueue } from "@/modules/used/components/UsedDisputeQueue";

export const metadata: Metadata = { title: "거래 분쟁" };

// 중고 안전거래 분쟁 큐 — 구매자가 신고한 거래를 환불/정산으로 중재한다.
export default async function MarketDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const queue = await listUsedDisputeQueue(page);

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        title="거래 분쟁"
        description="발송·전달 후 신고된 거래를 확인하고 환불 또는 정산으로 종결해요."
      />
      <UsedDisputeQueue items={queue.items} />
    </AdminPage>
  );
}
