import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { listSeriesOptions } from "@/modules/series/lib/queries";
import { ProductForm } from "@/modules/products/components/ProductForm";
import { getProductById } from "@/modules/products/lib/queries";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const [product, teams, members, series] = await Promise.all([
    getProductById(productId),
    listTeams(),
    listMembers(),
    listSeriesOptions(),
  ]);

  if (!product) notFound();

  return (
    <AdminPage>
      <AdminPageHeader title="상품 수정" />
      <ProductForm
        product={product}
        teams={teams}
        members={members}
        series={series}
        publicBaseUrl={env.R2_PUBLIC_BASE}
      />
    </AdminPage>
  );
}
