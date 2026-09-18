import { Toaster } from "@/components/ui/sonner";
import { getDeliveryPolicy } from "@/modules/orders/lib/queries";
import { DeliveryPolicyForm } from "@/modules/orders/components/DeliveryPolicyForm";

// 관리자 — 배송 정책 (기본 배송비 · 무료배송 기준). 주문 금액 계산의 단일 소스.
export default async function AdminDeliveryPage() {
  const policy = await getDeliveryPolicy();

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Toaster />
      <div>
        <h2 className="text-2xl font-bold">배송 정책</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          모든 주문의 배송비 계산에 적용됩니다. 상품 합계가 무료배송 기준 이상이면
          배송비가 면제돼요.
        </p>
      </div>
      <div className="max-w-lg">
        <DeliveryPolicyForm policy={policy} />
      </div>
    </div>
  );
}
