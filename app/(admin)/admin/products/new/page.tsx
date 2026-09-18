import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { ProductForm } from "@/modules/products/components/ProductForm";

export default async function ProductNewPage() {
  const [teams, members] = await Promise.all([listTeams(), listMembers()]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toaster />
      <h2 className="shrink-0 px-6 pb-4 pt-6 text-2xl font-bold">신규 상품 등록</h2>
      <div className="min-h-0 flex-1">
        <ProductForm
          mode="new"
          teams={teams}
          members={members}
          publicBaseUrl={env.R2_PUBLIC_BASE}
        />
      </div>
    </div>
  );
}
