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
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">매입자별 정산</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            각 매입자가 등록한 상품의 총원가(매입가+부대비용)·판매가·예상
            이익을 합산했어요. 재고 수량과 무관하게 상품(리스팅) 단위로 계산합니다.
          </p>
        </div>
        <SettlementExport rows={settlements} />
      </div>

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
          <div className="overflow-x-auto rounded-md border border-border bg-card shadow-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-muted/40 text-left">
                  <th className="px-4 py-2.5 font-medium">매입자</th>
                  <th className="px-4 py-2.5 text-right font-medium">상품</th>
                  <th className="px-4 py-2.5 text-right font-medium">재고</th>
                  <th className="px-4 py-2.5 text-right font-medium">총원가</th>
                  <th className="px-4 py-2.5 text-right font-medium">판매가</th>
                  <th className="px-4 py-2.5 text-right font-medium">예상 이익</th>
                  <th className="px-4 py-2.5 text-right font-medium">마진율</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr
                    key={s.purchaser ?? "__unassigned__"}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {s.purchaser ?? (
                        <span className="text-muted-foreground">미지정</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s.productCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s.totalStock}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {won(s.totalCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {won(s.totalSalePrice)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        s.profit >= 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {won(s.profit)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s.marginRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
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
                    className={`px-4 py-2.5 text-right tabular-nums ${
                      totals.profit >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {won(totals.profit)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {totals.marginRate}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
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
    <div className="rounded-md border border-border bg-card p-3 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${
          positive === undefined
            ? ""
            : positive
              ? "text-primary"
              : "text-destructive"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
