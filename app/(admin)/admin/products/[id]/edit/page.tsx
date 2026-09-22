import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductForm } from "@/modules/products/components/ProductForm";
import { getProductById } from "@/modules/products/lib/queries";
import { DuplicateListingButton } from "@/modules/products/components/DuplicateListingButton";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const [product, teams, members] = await Promise.all([
    getProductById(productId),
    listTeams(),
    listMembers(),
  ]);

  if (!product) notFound();

  return (
    <AdminPage>
      <AdminPageHeader title="상품 수정">
        <DuplicateListingButton productId={productId} />
      </AdminPageHeader>
      <ProductForm
        mode="edit"
        product={product}
        teams={teams}
        members={members}
        publicBaseUrl={env.R2_PUBLIC_BASE}
      />
    </AdminPage>
  );
}
