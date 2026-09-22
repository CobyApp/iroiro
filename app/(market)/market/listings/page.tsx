import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listAdminUsedListings } from "@/modules/used/lib/report";
import { UsedListingsAdminTable } from "@/modules/used/components/UsedListingsAdminTable";
import { USED_STATUS_LABEL, type UsedStatus } from "@/modules/used/types";

export const metadata: Metadata = { title: "매물" };

// 상태 필터 탭 — 전체 + 각 status. 신고 수·차단은 표에서.
const FILTERS: { key: string; label: string; status?: UsedStatus }[] = [
  { key: "all", label: "전체" },
  { key: "active", label: USED_STATUS_LABEL.active, status: "active" },
  { key: "reserved", label: USED_STATUS_LABEL.reserved, status: "reserved" },
  { key: "sold", label: USED_STATUS_LABEL.sold, status: "sold" },
  { key: "blocked", label: USED_STATUS_LABEL.blocked, status: "blocked" },
];

export default async function MarketListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: statusParam, page: pageParam } = await searchParams;
  const active = FILTERS.find((f) => f.key === statusParam) ?? FILTERS[0];
  const page = Math.max(1, Number(pageParam) || 1);
  const result = await listAdminUsedListings({ status: active.status, page });

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader title="매물" description="등록된 중고 매물을 살펴보고 필요하면 차단해요." />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const href = f.key === "all" ? "/market/listings" : `/market/listings?status=${f.key}`;
          const isActive = f.key === active.key;
          return (
            <Link
              key={f.key}
              href={href}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                isActive
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <UsedListingsAdminTable
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        publicBaseUrl={env.R2_PUBLIC_BASE}
        basePath="/market/listings"
        query={active.key === "all" ? {} : { status: active.key }}
        emptyLabel="해당 상태의 매물이 없습니다"
      />
    </AdminPage>
  );
}
