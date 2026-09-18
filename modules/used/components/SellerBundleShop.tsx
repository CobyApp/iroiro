"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/modules/products/components/ProductImage";
import { buyUsedBundle } from "../bundle-actions";
import { PRODUCT_CONDITION_LABEL, type UsedListingWithPhotos } from "../types";

// 판매자 상점 — 같은 판매자의 매물을 골라 묶음 구매(배송비 1회). 메루카리 おまとめ.
// 고정가·판매중 매물만 선택 가능. 2개 이상 담으면 배송비 절감액을 보여준다.
export function SellerBundleShop({
  listings,
  publicBaseUrl,
  pointBalance,
}: {
  listings: UsedListingWithPhotos[];
  publicBaseUrl: string;
  pointBalance: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pointsInput, setPointsInput] = useState("0");

  const eligible = (l: UsedListingWithPhotos) =>
    l.saleMode === "fixed" && l.status === "active";

  const picked = useMemo(
    () => listings.filter((l) => selected.has(l.id)),
    [listings, selected],
  );
  const itemTotal = picked.reduce((s, l) => s + (l.price ?? 0), 0);
  const shippingEach = picked.reduce((s, l) => s + l.shippingFee, 0);
  const shippingBundle = picked.length ? Math.max(...picked.map((l) => l.shippingFee)) : 0;
  const shippingSaved = shippingEach - shippingBundle;
  const maxPoints = Math.max(0, Math.min(pointBalance, itemTotal));
  const usePoints = Math.max(
    0,
    Math.min(Number(pointsInput.replace(/[^0-9]/g, "")) || 0, maxPoints),
  );
  const buyerTotal = Math.max(0, itemTotal - usePoints + shippingBundle);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await buyUsedBundle({
        listingIds: [...selected],
        recipientName: name,
        recipientPhone: phone,
        recipientAddress: address,
        usePoints,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("묶음 구매 완료! 판매자가 함께 발송해요 (결제 체험판)");
      setOpen(false);
      router.push(`/used/bundle/${result.data.bundleId}`);
    });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
        {listings.map((l) => {
          const primary = l.photos.find((p) => p.isPrimary) ?? l.photos[0];
          const canPick = eligible(l);
          const isPicked = selected.has(l.id);
          const price = l.saleMode === "auction"
            ? (l.auctionCurrentPrice ?? l.auctionStartPrice ?? 0)
            : (l.price ?? 0);
          return (
            <div key={l.id} className="space-y-2">
              <div
                className={cn(
                  "relative aspect-[3/4] overflow-hidden rounded-sm border bg-lilac",
                  isPicked ? "border-primary ring-2 ring-primary/40" : "border-border",
                )}
              >
                {canPick ? (
                  <button
                    type="button"
                    onClick={() => toggle(l.id)}
                    aria-pressed={isPicked}
                    className="absolute inset-0 z-10"
                    aria-label={`${l.title} ${isPicked ? "선택 해제" : "묶음에 담기"}`}
                  >
                    <span
                      className={cn(
                        "absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border",
                        isPicked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card/90",
                      )}
                    >
                      {isPicked && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                ) : (
                  <Link href={`/used/${l.id}`} className="absolute inset-0 z-10">
                    <span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {l.saleMode === "auction" ? "경매" : "거래중"}
                    </span>
                  </Link>
                )}
                {primary ? (
                  <ProductImage
                    src={`${publicBaseUrl}/${primary.r2Key}`}
                    alt={l.title}
                    className={cn("h-full w-full object-cover", !canPick && "opacity-60")}
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>
              <div className="px-0.5">
                <p className="line-clamp-1 text-sm font-medium text-foreground">{l.title}</p>
                <p className="text-sm font-semibold text-primary">₩{price.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground">
                  {PRODUCT_CONDITION_LABEL[l.condition]}
                  {l.shippingFee > 0 ? ` · 배송 ${l.shippingFee.toLocaleString()}` : " · 배송비 포함"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 묶음 바 — 1개 이상 담으면 표시, 2개 이상이어야 구매 가능. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-elevated">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-foreground">
                {selected.size}개 · ₩{(itemTotal + shippingBundle).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                배송비 1회 ₩{shippingBundle.toLocaleString()}
                {shippingSaved > 0 && (
                  <span className="ml-1 text-primary">
                    (₩{shippingSaved.toLocaleString()} 절약)
                  </span>
                )}
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={selected.size < 2}>
                  {selected.size < 2 ? "2개 이상 담기" : "묶음 구매"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>묶음 배송지 입력</DialogTitle>
                </DialogHeader>
                <div className="space-y-2.5">
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">상품 {picked.length}개</span>
                      <span>₩{itemTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">배송비 (1회)</span>
                      <span>
                        ₩{shippingBundle.toLocaleString()}
                        {shippingSaved > 0 && (
                          <span className="ml-1 text-primary">
                            −₩{shippingSaved.toLocaleString()}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="받는 사람" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처" inputMode="tel" />
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" />
                  {maxPoints > 0 && (
                    <div className="flex gap-2">
                      <Input
                        value={pointsInput}
                        onChange={(e) => setPointsInput(e.target.value)}
                        onBlur={() => setPointsInput(String(usePoints))}
                        inputMode="numeric"
                        aria-label="사용할 포인트"
                        placeholder={`포인트 (최대 ${maxPoints.toLocaleString()})`}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={() => setPointsInput(String(maxPoints))}>
                        전액
                      </Button>
                    </div>
                  )}
                  <Button
                    className="w-full gap-1.5"
                    disabled={pending || !name || !phone || address.length < 5}
                    onClick={submit}
                  >
                    <PackageCheck className="h-4 w-4" />
                    {pending ? "처리 중…" : `₩${buyerTotal.toLocaleString()} 묶음 결제`}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    결제는 체험판이라 실제로 청구되지 않아요.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      )}
    </>
  );
}
