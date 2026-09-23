import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { getOrderByOrderNo } from "@/modules/orders/lib/queries";

export const metadata: Metadata = { title: "결제 완료" };

type Params = Promise<{ orderNo: string }>;

export default async function OrderCompletePage({
  params,
}: {
  params: Params;
}) {
  const { orderNo } = await params;
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("orders"));

  const order = await getOrderByOrderNo(account.id, orderNo);
  if (!order) redirect("/");
  // 결제 미완료·취소 — 완료 화면 대신 주문 상세로.
  if (order.status === "pending" || order.status === "canceled") {
    redirect(`/orders/${orderNo}`);
  }

  return (
    <div className="shop-page-frame space-y-6 py-10 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">결제가 완료되었습니다</h1>
        <p className="text-sm text-muted-foreground">
          주문번호 {order.orderNo}
        </p>
      </div>
      <p className="text-lg font-bold">₩{order.totalAmount.toLocaleString()}</p>
      <div className="flex justify-center gap-2">
        <Button asChild variant="outline">
          <Link href={`/orders/${order.orderNo}`}>주문 상세</Link>
        </Button>
        <Button asChild>
          <Link href="/products">쇼핑 계속하기</Link>
        </Button>
      </div>
    </div>
  );
}
