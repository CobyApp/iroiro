import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
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
    <AdminPage narrow>
      <AdminPageHeader title="배너 수정" />
      <BannerForm
        mode="edit"
        banner={banner}
        initialImageUrl={`${env.R2_PUBLIC_BASE}/${banner.imageKey}`}
      />
    </AdminPage>
  );
}
