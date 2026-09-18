import { Toaster } from "@/components/ui/sonner";
import { BannerForm } from "@/modules/banners/components/BannerForm";

export default function BannerNewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">신규 배너</h2>
      <BannerForm mode="new" />
    </div>
  );
}
