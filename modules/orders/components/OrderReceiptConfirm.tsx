"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { confirmOrderReceipt } from "../actions";
import { ORDER_AUTO_CONFIRM_DAYS } from "../lib/settle-order-constants";

// 구매자 수령확정 — 발송된 주문을 받은 뒤 직접 배송완료로 확정한다.
// 누르지 않아도 발송 후 ORDER_AUTO_CONFIRM_DAYS일이 지나면 자동 확정된다.
export function OrderReceiptConfirm({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await confirmOrderReceipt({ orderNo });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("수령을 확정했어요. 도착 인증 리뷰를 남겨보세요!");
      router.refresh();
    });
  }

  return (
    <ConfirmDialog
      trigger={
        <Button className="w-full gap-1.5" disabled={pending}>
          <PackageCheck className="h-4 w-4" />
          {pending ? "처리 중…" : "수령확정"}
        </Button>
      }
      title="상품을 받으셨나요?"
      description={`수령확정하면 배송완료로 처리돼요. 확정하지 않아도 발송 후 ${ORDER_AUTO_CONFIRM_DAYS}일이 지나면 자동으로 확정됩니다.`}
      confirmLabel="수령확정"
      pending={pending}
      onConfirm={confirm}
    />
  );
}
