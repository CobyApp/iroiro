import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { PendingWorkItem } from "../lib/pending-work";

// 관리 공간별 색 — 명령 팔레트/셸 배지와 결을 맞춘 구분감.
const SCOPE_ACCENT: Record<PendingWorkItem["scope"], string> = {
  delivery: "bg-cyan/25 text-ink",
  market: "bg-lemon/50 text-ink",
  board: "bg-mint/40 text-ink",
  catalog: "bg-accent/15 text-accent",
};
const SCOPE_LABEL: Record<PendingWorkItem["scope"], string> = {
  delivery: "스토어",
  market: "중고거래",
  board: "커뮤니티",
  catalog: "토레카",
};

// 처리 대기 현황 — 건수가 있는 큐를 먼저(많은 순), 0건은 뒤에 조용히.
export function PendingWork({ items }: { items: PendingWorkItem[] }) {
  const total = items.reduce((sum, it) => sum + it.count, 0);
  const sorted = [...items].sort((a, b) => b.count - a.count);

  return (
    <section className="shop-content-surface space-y-4" aria-labelledby="pending-work-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="pending-work-title" className="shop-section-title">
          처리 대기
        </h2>
        <span className="text-sm text-muted-foreground">
          총 {total.toLocaleString()}건
        </span>
      </div>

      {total === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-4 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
          지금 처리할 대기 작업이 없어요. 깔끔합니다!
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sorted.map((it) => {
            const pending = it.count > 0;
            return (
              <li key={it.key}>
                <Link
                  href={it.href}
                  className={[
                    "group flex h-full flex-col justify-between gap-2 rounded-xl border px-3.5 py-3 transition-colors",
                    pending
                      ? "border-primary/30 bg-card hover:border-primary/60"
                      : "border-border/60 bg-card/50 hover:bg-muted/50",
                  ].join(" ")}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SCOPE_ACCENT[it.scope]}`}
                    >
                      {SCOPE_LABEL[it.scope]}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-muted-foreground">
                      {it.label}
                    </span>
                    <span
                      className={[
                        "font-display text-2xl",
                        pending ? "text-foreground" : "text-muted-foreground/50",
                      ].join(" ")}
                    >
                      {it.count.toLocaleString()}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
