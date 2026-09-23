import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getCartItems } from "@/modules/cart/lib/queries";
import { getProductsByIds } from "@/modules/products/lib/queries";
import { getDeliveryPolicy } from "@/modules/orders/lib/queries";
import {
  CartView,
  type CartLineView,
} from "@/modules/cart/components/CartView";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";

export const metadata: Metadata = { title: "장바구니" };

export default async function CartPage() {
  const account = await getCurrentAccount();
  if (!account) {
    return (
      <GuestFeatureGate
        icon={ShoppingBag}
        title="장바구니를 미리 둘러보세요"
        description="상품 탐색과 상세 정보 확인은 로그인 없이 가능합니다. 구매할 상품을 계정에 안전하게 보관하고 주문하려면 로그인해주세요."
        benefits={[
          "선택 상품과 수량 한 번에 관리",
          "배송비와 최종 결제 금액 자동 계산",
        ]}
      />
    );
  }

  const [cartItems, policy] = await Promise.all([
    getCartItems(account.id),
    getDeliveryPolicy(),
  ]);
  const products = await getProductsByIds(
    cartItems.map((item) => item.productId),
  );
  const productById = new Map(products.map((product) => [product.id, product]));

  const lines: CartLineView[] = cartItems.map((item) => {
    const product = productById.get(item.productId);
    const thumbnail =
      product?.photos.find((photo) => photo.isThumbnail) ?? product?.photos[0];
    const available =
      product !== undefined &&
      product.saleStatus === "active" &&
      product.stockQuantity > 0;
    return {
      cartItemId: item.id,
      productId: item.productId,
      name: product?.name ?? "삭제된 상품",
      unitPrice: product?.salePrice ?? 0,
      quantity: item.quantity,
      stockQuantity: product?.stockQuantity ?? 0,
      available,
      thumbnailUrl: thumbnail ? productGridThumbnailUrl(item.productId) : null,
    };
  });

  if (lines.length === 0) {
    return (
      <div className="shop-page-frame space-y-6">
        <ShopPageHeader
          title="장바구니"
          action={
            <Link
              href="/orders"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              주문 내역
            </Link>
          }
        />
        <EmptyState
          emoji="🛍️"
          title="장바구니가 비어 있어요"
          description="마음에 드는 토레카를 담아보세요"
          action={{ href: "/products", label: "상품 둘러보기" }}
        />
      </div>
    );
  }

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        title="장바구니"
        action={
          <Link
            href="/orders"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            주문 내역
          </Link>
        }
      />
      <CartView
        lines={lines}
        policy={{
          deliveryFee: policy.deliveryFee,
          freeThresholdAmount: policy.freeThresholdAmount,
        }}
      />
    </div>
  );
}
