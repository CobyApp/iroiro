import type { Metadata } from "next";
import Link from "next/link";
import { PageBack } from "@/components/PageBack";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listOrdersByAccount } from "@/modules/orders/lib/queries";
import { OrderList } from "@/modules/orders/components/OrderList";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";

export const metadata: Metadata = { title: "주문 내역" };

export default async function OrdersPage() {
  const account = await getCurrentAccount();
  if (!account) {
    return (
      <GuestFeatureGate
        icon={PackageCheck}
        title="주문과 배송 상태를 한곳에서 확인하세요"
        description="주문 내역은 개인 결제 정보가 포함되어 로그인한 본인에게만 보여드립니다. 페이지와 제공 기능은 로그인 전에도 확인할 수 있어요."
        benefits={["결제 완료 주문 모아보기", "주문별 상품과 배송 상태 확인"]}
      />
    );
  }

  const orders = await listOrdersByAccount(account.id);

  return (
    <div className="shop-page-frame space-y-6">
      <div className="flex items-center gap-2">
        <PageBack fallbackHref="/mypage" />
        <h1 className="text-2xl font-bold">주문 내역</h1>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">주문 내역이 없습니다</p>
          <Button asChild className="mt-4">
            <Link href="/products">쇼핑하러 가기</Link>
          </Button>
        </div>
      ) : (
        <OrderList orders={orders} />
      )}
    </div>
  );
}
