import { Toaster } from "@/components/ui/sonner";
import { listReviewsForAdmin } from "@/modules/reviews/lib/admin-queries";
import { AdminReviewsTable } from "@/modules/reviews/components/AdminReviewsTable";

export const metadata = { title: "리뷰 관리" };

export default async function AdminReviewsPage() {
  const reviews = await listReviewsForAdmin();

  return (
    <div className="space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">리뷰</h2>
      <div className="rounded-md border border-border">
        <AdminReviewsTable reviews={reviews} />
      </div>
      <p className="text-xs text-muted-foreground">
        리뷰는 배송 완료된 주문의 구매자만 남길 수 있어요. 부적절한 리뷰만
        삭제해주세요 — 삭제는 되돌릴 수 없습니다.
      </p>
    </div>
  );
}
