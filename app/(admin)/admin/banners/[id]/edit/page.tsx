import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { Toaster } from "@/components/ui/sonner";
import { getBanner } from "@/modules/banners/lib/queries";
import { BannerForm } from "@/modules/banners/components/BannerForm";

export default async function BannerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const banner = await getBanner(Number(id));
  if (!banner) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">배너 수정</h2>
      <BannerForm
        mode="edit"
        banner={banner}
        initialImageUrl={`${env.R2_PUBLIC_BASE}/${banner.imageKey}`}
      />
    </div>
  );
}
