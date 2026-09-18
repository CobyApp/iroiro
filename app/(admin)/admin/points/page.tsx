import { Toaster } from "@/components/ui/sonner";
import { formatKstDateTime } from "@/lib/datetime";
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
    <div className="space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">포인트 · 쿠폰</h2>

      <AdminPointsGrantForm />

      <h3 className="pt-2 text-sm font-semibold">최근 포인트 내역 (전체 회원)</h3>
      <div className="rounded-md border border-border">
        {transactions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            아직 내역이 없습니다
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">회원</th>
                  <th className="px-4 py-2.5 text-right font-medium">포인트</th>
                  <th className="px-4 py-2.5 font-medium">사유</th>
                  <th className="px-4 py-2.5 font-medium">메모</th>
                  <th className="px-4 py-2.5 font-medium">일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5">{row.accountName}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        row.amount > 0 ? "text-primary" : ""
                      }`}
                    >
                      {row.amount > 0 ? "+" : ""}
                      {row.amount.toLocaleString()}P
                    </td>
                    <td className="px-4 py-2.5">{reasonLabel(row.reason)}</td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {row.memo ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {formatKstDateTime(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
