import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listReviewsForAdmin } from "@/modules/reviews/lib/admin-queries";
import { listProductReviewReportQueue } from "@/modules/reviews/lib/report";
import { AdminReviewsTable } from "@/modules/reviews/components/AdminReviewsTable";
import { ReviewReportQueue } from "@/modules/reviews/components/ReviewReportQueue";

export const metadata = { title: "리뷰 · 신고" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const [reviews, queue] = await Promise.all([
    listReviewsForAdmin(),
    listProductReviewReportQueue(page),
  ]);

  return (
    <AdminPage className="space-y-8">
      <section className="space-y-3">
        <AdminPageHeader
          title="리뷰 신고"
          count={queue.total}
          description="접수된 리뷰 신고를 숨김·기각으로 처리해요. 숨김은 나중에 해제할 수 있어요."
        />
        <ReviewReportQueue
          items={queue.items}
          total={queue.total}
          page={queue.page}
          pageSize={queue.pageSize}
        />
      </section>

      <section className="space-y-3">
        <AdminPageHeader title="리뷰" count={reviews.length} />
        <AdminReviewsTable reviews={reviews} />
        <p className="text-xs text-muted-foreground">
          리뷰는 배송 완료된 주문의 구매자만 남길 수 있어요. 부적절한 리뷰는 신고 큐에서
          숨기거나, 여기서 완전히 삭제할 수 있어요 — 삭제는 되돌릴 수 없습니다.
        </p>
      </section>
    </AdminPage>
  );
}
