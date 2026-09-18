import { Toaster } from "@/components/ui/sonner";
import { getSiteSettings } from "@/modules/site-settings/lib/queries";
import { UsedTradeSettingForm } from "@/modules/site-settings/components/UsedTradeSettingForm";

// 관리자 — 사이트 전역 설정 (중고거래 온오프·수수료).
export default async function AdminSettingsPage() {
  const settings = await getSiteSettings();

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-bold">설정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          사이트 전체에 즉시 반영되는 전역 설정이에요.
        </p>
      </div>
      <UsedTradeSettingForm
        initialEnabled={settings.usedTradeEnabled}
        initialFeeBp={settings.usedTradeFeeBp}
      />
    </div>
  );
}
