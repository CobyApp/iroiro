import Link from "next/link";
import { Plus } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listBanners } from "@/modules/banners/lib/queries";
import { BannersTable } from "@/modules/banners/components/BannersTable";

export default async function AdminBannersPage() {
  const banners = await listBanners();

  return (
    <AdminPage>
      <AdminPageHeader title="배너" count={banners.length}>
        <Button asChild>
          <Link href="/admin/banners/new">
            <Plus className="mr-0.5 h-4 w-4" />
            신규 배너
          </Link>
        </Button>
      </AdminPageHeader>
      <div className="rounded-md border border-border bg-card shadow-card">
        <BannersTable banners={banners} publicBase={env.R2_PUBLIC_BASE} />
      </div>
    </AdminPage>
  );
}
