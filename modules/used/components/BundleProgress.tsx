"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShipmentForm } from "@/components/ShipmentForm";
import { courierLabel, courierTrackingUrl } from "@/lib/shipping/couriers";
import { confirmBundleReceived, markBundleShipped } from "../bundle-actions";
import { USED_BUNDLE_STATUS_LABEL, type UsedBundle } from "../types";

type Role = "seller" | "buyer";

// 묶음 거래 진행 — 결제 → (판매자) 송장입력·발송 → (구매자) 수령 확정.
export function BundleProgress({
  bundle,
  role,
  autoConfirmNote = null,
}: {
  bundle: UsedBundle;
  role: Role;
  autoConfirmNote?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "실패했어요");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">거래 진행</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {USED_BUNDLE_STATUS_LABEL[bundle.status]}
        </span>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">상품 합계</dt>
          <dd className="font-medium">₩{bundle.itemTotal.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">배송비 (1회)</dt>
          <dd>₩{bundle.shippingFee.toLocaleString()}</dd>
        </div>
        {bundle.pointsUsed > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">포인트 사용</dt>
            <dd className="text-primary">−₩{bundle.pointsUsed.toLocaleString()}</dd>
          </div>
        )}
        {role === "seller" && (
          <div className="flex justify-between border-t border-border pt-1">
            <dt className="text-muted-foreground">정산 예정</dt>
            <dd className="font-semibold text-primary">
              ₩{bundle.sellerPayout.toLocaleString()}
            </dd>
          </div>
        )}
      </dl>

      {role === "seller" && bundle.status === "paid" && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            한 상자에 함께 담아 접수한 뒤 택배사·송장번호를 입력하세요.
          </p>
          <ShipmentForm
            pending={pending}
            onSubmit={(courier, trackingCode) =>
              run(
                () => markBundleShipped(bundle.id, { courier, trackingCode }),
                "발송 처리했어요",
              )
            }
          />
        </div>
      )}

      {role === "buyer" && bundle.status === "shipped" && (
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={pending}
            onClick={() => run(() => confirmBundleReceived(bundle.id), "거래가 완료됐어요!")}
          >
            <PackageCheck className="h-4 w-4" />
            수령 확정
          </Button>
          {autoConfirmNote && (
            <p className="text-center text-xs text-muted-foreground">
              {autoConfirmNote}
            </p>
          )}
        </div>
      )}
      {role === "buyer" && bundle.status === "paid" && (
        <p className="text-xs text-muted-foreground">
          판매자가 함께 발송을 준비하고 있어요.
        </p>
      )}
      {bundle.status === "shipped" && bundle.postTrackingCode && (
        <div className="space-y-0.5 border-t border-border pt-2 text-center text-xs text-muted-foreground">
          <p>
            {courierLabel(bundle.courier)}{" "}
            <span className="font-mono">{bundle.postTrackingCode}</span>
          </p>
          {courierTrackingUrl(bundle.courier, bundle.postTrackingCode) && (
            <a
              href={courierTrackingUrl(bundle.courier, bundle.postTrackingCode)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-primary underline underline-offset-2"
            >
              배송 조회 →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
