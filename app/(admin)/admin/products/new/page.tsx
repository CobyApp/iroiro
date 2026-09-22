import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesOptions } from "@/modules/series/lib/queries";
import { ProductForm } from "@/modules/products/components/ProductForm";

export default async function ProductNewPage() {
  const [teams, members, series] = await Promise.all([
    listTeams(),
    listMembers(),
    listSeriesOptions(),
  ]);

  return (
    <AdminPage>
      <AdminPageHeader title="신규 상품 등록" />
      <ProductForm
        mode="new"
        teams={teams}
        members={members}
        series={series}
        publicBaseUrl={env.R2_PUBLIC_BASE}
        catalogPublicBase={env.CATALOG_PUBLIC_BASE}
      />
    </AdminPage>
  );
}
