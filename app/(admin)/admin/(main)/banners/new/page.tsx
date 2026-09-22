import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { BannerForm } from "@/modules/banners/components/BannerForm";

export default function BannerNewPage() {
  return (
    <AdminPage narrow>
      <AdminPageHeader title="신규 배너" />
      <BannerForm mode="new" />
    </AdminPage>
  );
}
