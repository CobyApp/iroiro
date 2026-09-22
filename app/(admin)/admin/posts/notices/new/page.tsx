import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { NoticeForm } from "@/modules/notices/components/NoticeForm";

export default function NoticeNewPage() {
  return (
    <AdminPage narrow>
      <AdminPageHeader title="신규 공지 등록" />
      <NoticeForm mode="new" />
    </AdminPage>
  );
}
