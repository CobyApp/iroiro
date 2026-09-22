import type { Metadata } from "next";
import Link from "next/link";
import { Package, ShoppingBag, Truck } from "lucide-react";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "홈" };

const LINKS = [
  { label: "상품", href: "/admin/store/products", icon: Package, hint: "등록·수정·재고·판매상태" },
  { label: "주문", href: "/admin/store/orders", icon: ShoppingBag, hint: "결제·발송·상태 관리" },
  { label: "배송 정책", href: "/admin/store/policy", icon: Truck, hint: "배송비·무료배송 기준" },
];

// 스토어·배송 관리 홈 — 상품·주문·정산·배송을 한곳에서 진입.
export default function StoreHomePage() {
  return (
    <AdminPage className="space-y-6">
      <AdminPageHeader title="스토어 · 배송 관리" description="스토어 상품·주문·정산과 배송 정책을 관리해요." />
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
