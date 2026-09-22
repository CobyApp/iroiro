import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { getSiteSettings } from "@/modules/site-settings/lib/queries";
import { UsedTradeSettingForm } from "@/modules/site-settings/components/UsedTradeSettingForm";

// 관리자 — 사이트 전역 설정 (중고거래 수수료).
export default async function AdminSettingsPage() {
  const settings = await getSiteSettings();

  return (
    <AdminPage>
      <AdminPageHeader
        title="설정"
        description="사이트 전체에 즉시 반영되는 전역 설정이에요."
      />
      <UsedTradeSettingForm initialFeeBp={settings.usedTradeFeeBp} />
    </AdminPage>
  );
}
