import type { Metadata } from "next";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listDuplicateProductGroups } from "@/modules/products/lib/queries";
import { DuplicateProductsTable } from "@/modules/products/components/DuplicateProductsTable";

export const metadata: Metadata = { title: "중복 정리" };

// 같은 카탈로그 카드로 중복 등록된 상품 정리 — 스토어 관리(delivery) 공간.
export default async function ProductDuplicatesPage() {
  const groups = await listDuplicateProductGroups();
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        title="상품 중복 정리"
        description="같은 토레카 카드로 중복 등록된 상품을 찾아 정리해요."
      />
      <DuplicateProductsTable groups={groups} publicBaseUrl={env.R2_PUBLIC_BASE} />
    </AdminPage>
  );
}
