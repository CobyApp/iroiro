import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUsedSettlementReport } from "@/modules/used/lib/settlement";

export const metadata: Metadata = { title: "정산" };

function won(n: number) {
  return `₩${n.toLocaleString()}`;
}

// 중고 정산 — 접근 통제는 used 레이아웃(used 권한)이 담당한다.
export default async function UsedSettlementPage() {
  const report = await getUsedSettlementReport(30);
  const stats = [
    { label: "완료 거래", value: `${report.tradeCount.toLocaleString()}건` },
    { label: "정산 지급 합계", value: won(report.payoutTotal) },
    { label: "수수료 합계", value: won(report.feeTotal) },
  ];

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        title="정산"
        description="최근 30일 완료된 중고 거래를 판매자별로 합산했어요."
      >
        <a
          href="/admin/used/settlement/export"
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          CSV 내보내기
        </a>
      </AdminPageHeader>

      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border/70 bg-card/70 px-3.5 py-3">
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-display text-lg text-foreground sm:text-xl">{s.value}</dd>
          </div>
        ))}
      </dl>

      {report.rows.length === 0 ? (
        <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          기간 내 완료된 거래가 없습니다
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>판매자</TableHead>
              <TableHead className="text-right">완료 거래</TableHead>
              <TableHead className="text-right">수수료</TableHead>
              <TableHead className="text-right">정산 지급액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((r) => (
              <TableRow key={r.sellerAccountId}>
                <TableCell className="py-2.5">
                  <Link
                    href={`/admin/users/${r.sellerAccountId}`}
                    className="underline-offset-2 hover:text-primary hover:underline"
                  >
                    {r.sellerName}
                  </Link>
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {r.tradeCount.toLocaleString()}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums text-muted-foreground">
                  {won(r.feeTotal)}
                </TableCell>
                <TableCell className="py-2.5 text-right font-medium tabular-nums">
                  {won(r.payoutTotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminPage>
  );
}
