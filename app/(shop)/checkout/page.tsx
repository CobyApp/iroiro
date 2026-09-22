import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getCartItems } from "@/modules/cart/lib/queries";
import { getProductsByIds } from "@/modules/products/lib/queries";
import { getDeliveryPolicy } from "@/modules/orders/lib/queries";
import { calculateOrderAmounts } from "@/modules/orders/lib/amounts";
import { CheckoutForm } from "@/modules/orders/components/CheckoutForm";
import { getDefaultAddress } from "@/modules/addresses/lib/queries";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import {
  countUsableFreeShippingCoupons,
  getPointBalance,
} from "@/modules/points/lib/queries";

export const metadata: Metadata = { title: "주문/결제" };

export default async function CheckoutPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("checkout"));

  const [cartItems, policy] = await Promise.all([
    getCartItems(account.id),
    getDeliveryPolicy(),
  ]);
  if (cartItems.length === 0) redirect("/cart");

  const products = await getProductsByIds(
    cartItems.map((item) => item.productId),
  );
  const productById = new Map(products.map((product) => [product.id, product]));

  // 구매 불가 항목이 하나라도 있으면 장바구니로 돌려보낸다(거기서 삭제 유도).
  const pricedItems: Array<{ unitPrice: number; quantity: number }> = [];
  for (const item of cartItems) {
    const product = productById.get(item.productId);
    if (
      !product ||
      product.saleStatus !== "active" ||
      product.stockQuantity < 1 ||
      item.quantity > product.stockQuantity
    ) {
      redirect("/cart");
    }
    pricedItems.push({ unitPrice: product.salePrice, quantity: item.quantity });
  }

  const amounts = calculateOrderAmounts(pricedItems, policy);
  const [pointBalance, freeShippingCoupons] = await Promise.all([
    getPointBalance(account.id),
    countUsableFreeShippingCoupons(account.id),
  ]);
  const defaultAddress = await getDefaultAddress(account.id);

  return (
    <div className="shop-page-frame space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">주문/결제</h1>
      </div>
      <CheckoutForm
        summary={{
          productAmount: amounts.productAmount,
          deliveryAmount: amounts.deliveryAmount,
          totalAmount: amounts.totalAmount,
        }}
        pointBalance={pointBalance}
        freeShippingCoupons={freeShippingCoupons}
        defaultAddress={defaultAddress}
      />
    </div>
  );
}
