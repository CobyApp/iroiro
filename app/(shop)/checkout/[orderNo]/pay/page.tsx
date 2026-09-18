import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { getOrderByOrderNo } from "@/modules/orders/lib/queries";
import { MockCheckout } from "@/modules/orders/components/MockCheckout";

export const metadata: Metadata = { title: "결제" };

type Params = Promise<{ orderNo: string }>;

export default async function PayPage({ params }: { params: Params }) {
  const { orderNo } = await params;
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("checkout"));

  const order = await getOrderByOrderNo(account.id, orderNo);
  if (!order) redirect("/");
  if (order.status === "paid") redirect(`/orders/${orderNo}/complete`);
  if (order.status !== "pending") redirect(`/orders/${orderNo}`);

  return (
    <div className="shop-page-frame space-y-6">
      <h1 className="text-2xl font-bold">결제</h1>
      <MockCheckout
        orderNo={order.orderNo}
        totalAmount={order.totalAmount}
        allowFailTest={env.PAYMENT_PROVIDER === "mock"}
      />
    </div>
  );
}
