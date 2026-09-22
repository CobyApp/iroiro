import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Ban, Flag, Store } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  countUnresolvedUsedReports,
  countUsedListingsByStatus,
} from "@/modules/used/lib/report";

export const metadata: Metadata = { title: "홈" };

// 중고거래 관리 홈 — 오늘 처리할 일(미해결 신고)과 매물·차단 현황을 한 화면에.
export default async function MarketHomePage() {
  const [openReports, counts] = await Promise.all([
    countUnresolvedUsedReports(),
    countUsedListingsByStatus(),
  ]);

  const stats = [
    {
      label: "미해결 신고",
      value: openReports,
      href: "/admin/used/reports",
      icon: AlertTriangle,
      warn: openReports > 0,
    },
    { label: "판매중 매물", value: counts.active, href: "/admin/used/listings", icon: Store },
    { label: "차단 매물", value: counts.blocked, href: "/admin/used/blocked", icon: Ban },
  ];

  return (
    <AdminPage className="space-y-6">
      <AdminPageHeader title="중고거래 관리" description="매물 신고 처리와 중고거래 운영을 한곳에서." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="group">
              <Card
                className={cn(
                  "h-full transition-colors group-hover:border-primary/50",
                  s.warn && "border-primary/40 bg-primary/5",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs">{s.label}</span>
                    <Icon className={cn("h-4 w-4", s.warn && "text-primary")} aria-hidden />
                  </div>
                  <p
                    className={cn(
                      "mt-2 font-display text-2xl tabular-nums",
                      s.warn && "text-primary",
                    )}
                  >
                    {s.value.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Flag className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">
            신고가 들어오면 「신고」에서 차단·기각으로 처리해요. 차단한 매물은 「차단 매물」에서 되돌릴 수 있어요.
          </span>
          <Link
            href="/admin/used/reports"
            className="ml-auto text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            신고 큐 열기 →
          </Link>
        </CardContent>
      </Card>
    </AdminPage>
  );
}
