import Link from "next/link";
import { Plus } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { listBanners } from "@/modules/banners/lib/queries";
import { BannersTable } from "@/modules/banners/components/BannersTable";

export default async function AdminBannersPage() {
  const banners = await listBanners();

  return (
    <div className="space-y-4 p-6">
      <Toaster />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">배너</h2>
        <Button asChild>
          <Link href="/admin/banners/new">
            <Plus className="mr-0.5 h-4 w-4" />
            신규 배너
          </Link>
        </Button>
      </div>
      <div className="rounded-md border border-border">
        <BannersTable banners={banners} publicBase={env.R2_PUBLIC_BASE} />
      </div>
    </div>
  );
}
