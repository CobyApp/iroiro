import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageBack } from "@/components/PageBack";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { getOrderByOrderNo } from "@/modules/orders/lib/queries";
import { OrderDetail } from "@/modules/orders/components/OrderDetail";
import { listMyReviewsForOrder } from "@/modules/reviews/lib/queries";

export const metadata: Metadata = { title: "주문 상세" };

type Params = Promise<{ orderNo: string }>;

export default async function OrderDetailPage({ params }: { params: Params }) {
  const { orderNo } = await params;
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("orders"));

  const order = await getOrderByOrderNo(account.id, orderNo);
  if (!order) notFound();

  const myReviews = await listMyReviewsForOrder(account.id, order.id);

  return (
    <div className="shop-page-frame space-y-4">
      <PageBack fallbackHref="/orders" />
      <OrderDetail order={order} myReviews={myReviews} />
    </div>
  );
}
