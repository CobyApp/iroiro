import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { getSiteSettings } from "@/modules/site-settings/lib/queries";
import { UsedTradeSettingForm } from "@/modules/site-settings/components/UsedTradeSettingForm";

// 중고거래 관리 — 판매 수수료 설정.
export default async function MarketFeeSettingPage() {
  const settings = await getSiteSettings();

  return (
    <AdminPage>
      <AdminPageHeader
        title="판매 수수료"
        description="중고거래 판매 수수료율이에요. 거래 시점에 스냅샷되어 이후 변경해도 진행 중 거래엔 영향 없어요."
      />
      <UsedTradeSettingForm initialFeeBp={settings.usedTradeFeeBp} />
    </AdminPage>
  );
}
