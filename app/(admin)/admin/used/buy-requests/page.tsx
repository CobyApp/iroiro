import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { requireUsedManager } from "@/modules/admin/lib/requireAdminSpace";
import { listBuyRequestsForAdmin } from "@/modules/used/lib/buy-queries";
import { BuyRequestsAdminTable } from "@/modules/used/components/BuyRequestsAdminTable";
import {
  BUY_REQUEST_STATUS_LABEL,
  type BuyRequestStatus,
} from "@/modules/used/buy-types";

export const metadata: Metadata = { title: "삽니다" };

const FILTERS: { key: string; label: string; status?: BuyRequestStatus }[] = [
  { key: "all", label: "전체" },
  { key: "open", label: BUY_REQUEST_STATUS_LABEL.open, status: "open" },
  { key: "fulfilled", label: BUY_REQUEST_STATUS_LABEL.fulfilled, status: "fulfilled" },
  { key: "closed", label: BUY_REQUEST_STATUS_LABEL.closed, status: "closed" },
  { key: "blocked", label: BUY_REQUEST_STATUS_LABEL.blocked, status: "blocked" },
];

// 삽니다(매입 요청) 모니터링 — 부적절한 요청을 차단. used 권한 필수.
export default async function AdminBuyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireUsedManager();
  const { status: statusParam, page: pageParam } = await searchParams;
  const active = FILTERS.find((f) => f.key === statusParam) ?? FILTERS[0];
  const page = Math.max(1, Number(pageParam) || 1);
  const { items, total } = await listBuyRequestsForAdmin(active.status, page);

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader title="삽니다" description="유저가 올린 매입 요청을 살펴보고 필요하면 차단해요." />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const href = f.key === "all" ? "/admin/used/buy-requests" : `/admin/used/buy-requests?status=${f.key}`;
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

      <BuyRequestsAdminTable
        items={items}
        total={total}
        page={page}
        pageSize={30}
        basePath="/admin/used/buy-requests"
        query={active.key === "all" ? {} : { status: active.key }}
      />
    </AdminPage>
  );
}
