import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatKstDateTime } from "@/lib/datetime";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listPointTransactionsForAdmin } from "@/modules/points/lib/admin-queries";
import { AdminPointsGrantForm } from "@/modules/points/components/AdminPointsGrantForm";
import {
  POINT_REASON_LABEL,
  type PointReason,
} from "@/modules/points/lib/rules";

export const metadata = { title: "포인트 · 쿠폰 관리" };

function reasonLabel(reason: string): string {
  return POINT_REASON_LABEL[reason as PointReason] ?? reason;
}

export default async function AdminPointsPage() {
  const transactions = await listPointTransactionsForAdmin();

  return (
    <AdminPage>
      <AdminPageHeader title="포인트 · 쿠폰" />

      <AdminPointsGrantForm />

      <h3 className="pt-2 text-sm font-semibold">최근 포인트 내역 (전체 회원)</h3>
      {transactions.length === 0 ? (
        <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          아직 내역이 없습니다
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회원</TableHead>
              <TableHead className="text-right">포인트</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>일시</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="py-2.5">{row.accountName}</TableCell>
                <TableCell
                  className={cn(
                    "py-2.5 text-right font-medium tabular-nums",
                    row.amount > 0 && "text-primary",
                  )}
                >
                  {row.amount > 0 ? "+" : ""}
                  {row.amount.toLocaleString()}P
                </TableCell>
                <TableCell className="py-2.5">{reasonLabel(row.reason)}</TableCell>
                <TableCell className="max-w-[220px] py-2.5">
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {row.memo ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                  {formatKstDateTime(row.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminPage>
  );
}
