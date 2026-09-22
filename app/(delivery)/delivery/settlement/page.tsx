import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listSettlementRows } from "@/modules/products/lib/queries";
import {
  settlementTotals,
  summarizeByPurchaser,
} from "@/modules/products/lib/settlement";
import { SettlementExport } from "@/modules/products/components/SettlementExport";

const won = (n: number) => `₩${n.toLocaleString()}`;

// 관리자 — 매입자별 회계 정산. 상품에 입력된 원가·판매가를 매입자 단위로 합산.
export default async function AdminSettlementPage() {
  const rows = await listSettlementRows();
  const settlements = summarizeByPurchaser(rows);
  const totals = settlementTotals(settlements);
  // 상품은 있으나 원가·판매가가 모두 0 → 매입 정보가 아직 안 채워진 상태.
  const needsData =
    settlements.length > 0 &&
    totals.totalCost === 0 &&
    totals.totalSalePrice === 0;

  return (
    <AdminPage>
      <AdminPageHeader
        title="매입자별 정산"
        description="각 매입자가 등록한 상품의 총원가(매입가+부대비용)·판매가·예상 이익을 합산했어요. 재고 수량과 무관하게 상품(리스팅) 단위로 계산합니다."
      >
        <SettlementExport rows={settlements} />
      </AdminPageHeader>

      {needsData && (
        <div className="rounded-md border border-border bg-lilac/40 px-4 py-3 text-sm text-muted-foreground">
          💡 상품에 <b className="text-foreground">매입가·매입자</b>를 입력하면
          여기 집계에 반영돼요. (상품 수정 또는 상품 목록에서 일괄 편집)
        </div>
      )}

      {settlements.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
          집계할 상품이 없어요.
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="총 상품" value={`${totals.productCount}개`} />
            <SummaryCard label="총원가" value={won(totals.totalCost)} />
            <SummaryCard label="총 판매가" value={won(totals.totalSalePrice)} />
            <SummaryCard
              label="예상 이익"
              value={`${won(totals.profit)} (${totals.marginRate}%)`}
              positive={totals.profit >= 0}
            />
          </div>

          {/* 매입자별 표 */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>매입자</TableHead>
                <TableHead className="text-right">상품</TableHead>
                <TableHead className="text-right">재고</TableHead>
                <TableHead className="text-right">총원가</TableHead>
                <TableHead className="text-right">판매가</TableHead>
                <TableHead className="text-right">예상 이익</TableHead>
                <TableHead className="text-right">마진율</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.purchaser ?? "__unassigned__"}>
                  <TableCell className="py-2.5 font-medium">
                    {s.purchaser ?? (
                      <span className="text-muted-foreground">미지정</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    {s.productCount}
                  </TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    {s.totalStock}
                  </TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    {won(s.totalCost)}
                  </TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    {won(s.totalSalePrice)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "py-2.5 text-right font-medium tabular-nums",
                      s.profit >= 0 ? "text-primary" : "text-destructive",
                    )}
                  >
                    {won(s.profit)}
                  </TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    {s.marginRate}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className="px-4 py-2.5">합계</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.productCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.totalStock}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {won(totals.totalCost)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {won(totals.totalSalePrice)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    totals.profit >= 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {won(totals.profit)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {totals.marginRate}%
                </td>
              </tr>
            </tfoot>
          </Table>
        </>
      )}
    </AdminPage>
  );
}

function SummaryCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card p-3 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 break-words text-lg font-bold",
          positive === undefined
            ? ""
            : positive
              ? "text-primary"
              : "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
