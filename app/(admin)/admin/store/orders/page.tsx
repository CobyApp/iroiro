import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listOrdersForAdmin } from "@/modules/orders/lib/admin-queries";
import { AdminOrdersTable } from "@/modules/orders/components/AdminOrdersTable";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  type OrderStatus,
} from "@/modules/orders/types";

export const metadata = { title: "주문 관리" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusRaw = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const status: OrderStatus | undefined = (
    ORDER_STATUSES as readonly string[]
  ).includes(statusRaw ?? "")
    ? (statusRaw as OrderStatus)
    : undefined;
  const pageRaw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(pageRaw) || 1);

  const orders = await listOrdersForAdmin(status, page);

  const chipClass = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border text-muted-foreground hover:text-foreground",
    );

  return (
    <AdminPage>
      <AdminPageHeader title="주문" count={orders.total}>
        {/* 상태 칩 — 폰에서는 한 줄 가로 스크롤 */}
        <nav
          aria-label="주문 상태 필터"
          className="scroll-x -mx-1 flex w-full gap-1.5 overflow-x-auto px-1 sm:w-auto sm:flex-wrap"
        >
          <Link href="/admin/store/orders" className={chipClass(status === undefined)}>
            전체
          </Link>
          {ORDER_STATUSES.map((value) => (
            <Link
              key={value}
              href={`/admin/store/orders?status=${value}`}
              className={chipClass(status === value)}
            >
              {ORDER_STATUS_LABEL[value]}
            </Link>
          ))}
        </nav>
      </AdminPageHeader>
      <AdminOrdersTable
        orders={orders.items}
        total={orders.total}
        page={orders.page}
        pageSize={orders.pageSize}
        status={status}
      />
      <p className="text-xs text-muted-foreground">
        발송 처리·배송 완료 시 구매자에게 알림이 발송됩니다. 배송 완료된 주문의
        구매자만 도착 인증 리뷰를 남길 수 있어요.
      </p>
    </AdminPage>
  );
}
