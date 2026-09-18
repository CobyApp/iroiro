"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck, QrCode, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmBundleReceived,
  issueBundlePostQr,
  markBundleShipped,
} from "../bundle-actions";
import { USED_BUNDLE_STATUS_LABEL, type UsedBundle } from "../types";

type Role = "seller" | "buyer";

function MockQr({ code }: { code: string }) {
  const cells = code
    .split("")
    .flatMap((ch, i) => [ch.charCodeAt(0) * 31 + i, ch.charCodeAt(0) * 17 + i * 3]);
  return (
    <div className="mx-auto w-fit rounded-sm border border-border bg-white p-3">
      <div className="grid grid-cols-12 gap-0.5">
        {Array.from({ length: 144 }, (_, i) => (
          <span
            key={i}
            className={
              (cells[i % cells.length] + i * 7) % 3 === 0
                ? "h-2 w-2 bg-black"
                : "h-2 w-2 bg-white"
            }
          />
        ))}
      </div>
      <p className="mt-2 text-center font-mono text-xs text-black">{code}</p>
    </div>
  );
}

// 묶음 거래 진행 — 결제 → (판매자) QR·발송 → (구매자) 수령 확정.
export function BundleProgress({ bundle, role }: { bundle: UsedBundle; role: Role }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qrCode, setQrCode] = useState<string | null>(bundle.postTrackingCode);

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
        <div className="space-y-2">
          {qrCode ? (
            <>
              <MockQr code={qrCode} />
              <p className="text-center text-xs text-muted-foreground">
                한 상자에 함께 담아 이 QR로 접수해요 (체험판)
              </p>
              <Button
                size="sm"
                className="w-full gap-1.5"
                disabled={pending}
                onClick={() => run(() => markBundleShipped(bundle.id), "발송 처리했어요")}
              >
                <Truck className="h-4 w-4" />
                발송 완료로 표시
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await issueBundlePostQr(bundle.id);
                  if (!result.ok) {
                    toast.error(result.message);
                    return;
                  }
                  setQrCode(result.data.trackingCode);
                  toast.success("우체국 접수 QR을 발급했어요 (체험판)");
                })
              }
            >
              <QrCode className="h-4 w-4" />
              우체국 접수 QR 발급
            </Button>
          )}
        </div>
      )}

      {role === "buyer" && bundle.status === "shipped" && (
        <Button
          size="sm"
          className="w-full gap-1.5"
          disabled={pending}
          onClick={() => run(() => confirmBundleReceived(bundle.id), "거래가 완료됐어요!")}
        >
          <PackageCheck className="h-4 w-4" />
          수령 확정
        </Button>
      )}
      {role === "buyer" && bundle.status === "paid" && (
        <p className="text-xs text-muted-foreground">
          판매자가 함께 발송을 준비하고 있어요.
        </p>
      )}
      {bundle.status === "shipped" && bundle.postTrackingCode && (
        <p className="text-center text-xs text-muted-foreground">
          등기번호 <span className="font-mono">{bundle.postTrackingCode}</span>
        </p>
      )}
    </div>
  );
}
