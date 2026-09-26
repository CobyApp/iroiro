import Link from "next/link";
import { ImageOff } from "lucide-react";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";
import type { SalesReport } from "../lib/sales-report";

function won(n: number) {
  return `₩${n.toLocaleString()}`;
}

// 매출 리포트 뷰 — 요약 지표 + 일별 막대(CSS) + 인기 상품. 서버 컴포넌트.
export function SalesReportView({ report }: { report: SalesReport }) {
  const maxSales = Math.max(1, ...report.daily.map((d) => d.sales));
  const stats = [
    { label: `최근 ${report.days}일 매출`, value: won(report.totalSales) },
    { label: "주문 수", value: `${report.totalOrders.toLocaleString()}건` },
    { label: "객단가(AOV)", value: won(report.avgOrderValue) },
  ];

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/70 bg-card/70 px-3.5 py-3"
          >
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-display text-lg text-foreground sm:text-xl">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="rounded-xl border border-border/70 bg-card/70 p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">일별 매출</h2>
        <div className="flex h-40 items-end gap-0.5 overflow-x-auto">
          {report.daily.map((d) => (
            <div
              key={d.date}
              className="group flex min-w-[6px] flex-1 flex-col items-center justify-end"
              title={`${d.date} · ${won(d.sales)} · ${d.orders}건`}
            >
              <div
                className="w-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(2, (d.sales / maxSales) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{report.daily[0]?.date}</span>
          <span>{report.daily[report.daily.length - 1]?.date}</span>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">인기 상품</h2>
        {report.topProducts.length === 0 ? (
          <p className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            기간 내 판매된 상품이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {report.topProducts.map((p, i) => (
              <li key={p.productId}>
                <Link
                  href={`/admin/store/products/${p.productId}/edit`}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                >
                  <span className="w-4 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xs border border-border bg-muted">
                    {p.thumbnailKey ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 관리자 썸네일
                      <img
                        src={productGridThumbnailUrl(p.productId)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {won(p.revenue)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.quantity.toLocaleString()}개
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
