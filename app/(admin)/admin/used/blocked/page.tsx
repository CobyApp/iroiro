import type { Metadata } from "next";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listAdminUsedListings } from "@/modules/used/lib/report";
import { UsedListingsAdminTable } from "@/modules/used/components/UsedListingsAdminTable";

export const metadata: Metadata = { title: "차단 매물" };

// 관리자가 차단한 매물 — 사유를 확인하고 필요하면 차단을 해제한다.
export default async function MarketBlockedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const result = await listAdminUsedListings({ status: "blocked", page });

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader title="차단 매물" description="차단된 매물을 확인하고 되돌릴 수 있어요." />
      <UsedListingsAdminTable
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        publicBaseUrl={env.R2_PUBLIC_BASE}
        basePath="/admin/used/blocked"
        emptyLabel="차단된 매물이 없습니다"
      />
    </AdminPage>
  );
}
