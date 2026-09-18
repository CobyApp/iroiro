// 최근 거래가 — 우리 주문 기록(있으면)과 외부 시세 참고를 함께 보여준다.
// 구매 결정을 돕는 참고 정보라 조용한 톤(카드 배경 + 작은 글씨)으로 배치.
export type RecentTrade = { price: number; agoLabel: string };

export function RecentPriceInfo({
  trades,
  marketAvgKrw,
  marketSoldCount,
}: {
  trades: RecentTrade[];
  /** 외부 시세 평균의 원화 환산(500원 단위) — 0이면 표시 안 함 */
  marketAvgKrw: number;
  marketSoldCount: number;
}) {
  if (trades.length === 0 && marketAvgKrw <= 0) return null;
  const latest = trades[0];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-border bg-lilac/40 px-3 py-2 text-xs text-muted-foreground">
      {latest && (
        <span>
          최근 거래가{" "}
          <b className="text-foreground">₩{latest.price.toLocaleString()}</b>
          <span className="ml-1">({latest.agoLabel})</span>
        </span>
      )}
      {marketAvgKrw > 0 && (
        <span>
          일본 시세 평균{" "}
          <b className="text-foreground">≈₩{marketAvgKrw.toLocaleString()}</b>
          {marketSoldCount > 0 && (
            <span className="ml-1">· 거래 {marketSoldCount}건 기준</span>
          )}
        </span>
      )}
    </div>
  );
}
