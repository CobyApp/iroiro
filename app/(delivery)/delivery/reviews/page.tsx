import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listReviewsForAdmin } from "@/modules/reviews/lib/admin-queries";
import { AdminReviewsTable } from "@/modules/reviews/components/AdminReviewsTable";

export const metadata = { title: "리뷰 관리" };

export default async function AdminReviewsPage() {
  const reviews = await listReviewsForAdmin();

  return (
    <AdminPage>
      <AdminPageHeader title="리뷰" count={reviews.length} />
      <AdminReviewsTable reviews={reviews} />
      <p className="text-xs text-muted-foreground">
        리뷰는 배송 완료된 주문의 구매자만 남길 수 있어요. 부적절한 리뷰만
        삭제해주세요 — 삭제는 되돌릴 수 없습니다.
      </p>
    </AdminPage>
  );
}
