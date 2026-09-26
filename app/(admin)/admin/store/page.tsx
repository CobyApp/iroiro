import type { Metadata } from "next";
import Link from "next/link";
import { Package, ShoppingBag, Truck } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getStoreAdminSummary } from "@/modules/orders/lib/admin-queries";

export const metadata: Metadata = { title: "홈" };

const LINKS = [
  { label: "상품", href: "/admin/store/products", icon: Package, hint: "등록·수정·재고·판매상태" },
  { label: "주문", href: "/admin/store/orders", icon: ShoppingBag, hint: "결제·발송·상태 관리" },
  { label: "배송 정책", href: "/admin/store/policy", icon: Truck, hint: "배송비·무료배송 기준" },
];

// 스토어·배송 관리 홈 — 요약 + 상품·주문·정산·배송 진입.
export default async function StoreHomePage() {
  const summary = await getStoreAdminSummary();
  const stats = [
    { label: "발송 대기", value: `${summary.awaitingShipment.toLocaleString()}건`, href: "/admin/store/orders?status=paid" },
    { label: "최근 30일 매출", value: `₩${summary.sales30.toLocaleString()}`, href: "/admin/store/reports" },
    { label: "임시저장 상품", value: `${summary.draftProducts.toLocaleString()}개`, href: "/admin/store/products?status=draft" },
    { label: "판매중 상품", value: `${summary.activeProducts.toLocaleString()}개`, href: "/admin/store/products?status=active" },
  ];
  return (
    <AdminPage className="space-y-6">
      <AdminPageHeader title="스토어 · 배송 관리" description="스토어 상품·주문·정산과 배송 정책을 관리해요." />

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group">
            <div className="h-full rounded-xl border border-border/70 bg-card/70 px-3.5 py-3 transition-colors group-hover:border-primary/50">
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 font-display text-lg text-foreground sm:text-xl">{s.value}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardContent className="space-y-2 p-4">
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                  <p className="font-display text-lg text-foreground">{l.label}</p>
                  <p className="text-xs text-muted-foreground">{l.hint}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </AdminPage>
  );
}
