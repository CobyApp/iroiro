import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
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
    <div className="flex h-full min-h-0 flex-col">
      <Toaster />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pb-4 pt-6">
        <h2 className="text-2xl font-bold">상품 수정</h2>
        <DuplicateListingButton productId={productId} />
      </div>
      <div className="min-h-0 flex-1">
        <ProductForm
          mode="edit"
          product={product}
          teams={teams}
          members={members}
          publicBaseUrl={env.R2_PUBLIC_BASE}
        />
      </div>
    </div>
  );
}
