"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Gavel, PackageCheck, QrCode, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoginPromptDialog } from "@/modules/auth/components/LoginPromptDialog";
import {
  bidIncrementFor,
  minNextBid,
  remainingLabel,
} from "@/modules/auction/lib/rules";
import { UsedWishlistButton } from "./UsedWishlistButton";
import {
  buyUsedListing,
  cancelUsedListing,
  confirmUsedReceived,
  issueUsedPostQr,
  markUsedShipped,
  placeUsedBid,
} from "../actions";
import {
  USED_TRADE_STATUS_LABEL,
  type UsedListingWithPhotos,
  type UsedTrade,
} from "../types";

type Role = "seller" | "buyer" | "visitor";

// 우체국 QR 목업 — 등기번호 기반 격자 패턴(실 연동 전 화면 흐름 확인용).
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

export function UsedDetailCta({
  listing,
  trade,
  role,
  isLoggedIn,
  wished = false,
  pointBalance = 0,
}: {
  listing: UsedListingWithPhotos;
  trade: UsedTrade | null;
  role: Role;
  isLoggedIn: boolean;
  wished?: boolean;
  /** 보유 포인트 — 구매 다이얼로그 포인트 사용 UI용. */
  pointBalance?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buyOpen, setBuyOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [bidConfirmOpen, setBidConfirmOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(
    trade?.postTrackingCode ?? null,
  );

  const [pointsInput, setPointsInput] = useState("0");

  const isAuction = listing.saleMode === "auction";
  const auctionLive = isAuction && listing.auctionStatus === "live";
  // 포인트는 상품가까지(배송비 제외) — 서버가 같은 규칙으로 재검증.
  const maxPoints = Math.max(0, Math.min(pointBalance, listing.price ?? 0));
  const usePoints = Math.max(
    0,
    Math.min(Number(pointsInput.replace(/[^0-9]/g, "")) || 0, maxPoints),
  );
  const buyerTotal = Math.max(
    0,
    (listing.price ?? 0) - usePoints + listing.shippingFee,
  );

  // 입찰 금액 — 스토어 경매와 동일하게 최소 입찰가를 미리 채우고,
  // 현재가가 바뀌면 새 최소가로 보정한다(렌더 중 상태 보정 패턴).
  const min = minNextBid(
    listing.auctionCurrentPrice,
    listing.auctionStartPrice ?? 0,
  );
  const [bidAmount, setBidAmount] = useState(String(min));
  const [lastMin, setLastMin] = useState(min);
  if (min !== lastMin) {
    setLastMin(min);
    setBidAmount(String(min));
  }

  function buy() {
    startTransition(async () => {
      const result = await buyUsedListing({
        listingId: listing.id,
        recipientName: name,
        recipientPhone: phone,
        recipientAddress: address,
        usePoints,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("구매 완료! 판매자가 발송을 준비해요 (결제 체험판)");
      setBuyOpen(false);
      router.refresh();
    });
  }

  // 입찰 버튼 → 확인 팝업 먼저(실수 방지), 팝업의 확정에서 실제 입찰.
  function requestBid() {
    if (!isLoggedIn) {
      setLoginPromptOpen(true);
      return;
    }
    setBidConfirmOpen(true);
  }

  function bid() {
    setBidConfirmOpen(false);
    const value = Number(String(bidAmount).replace(/[^0-9]/g, ""));
    startTransition(async () => {
      const result = await placeUsedBid(listing.id, value);
      if (!result.ok) {
        toast.error(result.message);
        router.refresh();
        return;
      }
      toast.success(
        `₩${value.toLocaleString()} 입찰 완료! 현재 최고가예요`,
      );
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.message ?? "실패했어요");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  // ── 거래 진행 패널 (거래가 시작된 뒤 — 구매자/판매자에게만) ──
  if (trade && role !== "visitor") {
    return (
      <div className="space-y-3 rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">거래 진행</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {USED_TRADE_STATUS_LABEL[trade.status]}
          </span>
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">거래가</dt>
            <dd className="font-medium">₩{trade.price.toLocaleString()}</dd>
          </div>
          {trade.shippingFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">배송비</dt>
              <dd>₩{trade.shippingFee.toLocaleString()}</dd>
            </div>
          )}
          {role === "seller" && (
            <div className="flex justify-between border-t border-border pt-1">
              <dt className="text-muted-foreground">
                정산 예정 (수수료 {trade.feeBp / 100}%)
              </dt>
              <dd className="font-semibold text-primary">
                ₩{trade.sellerPayout.toLocaleString()}
              </dd>
            </div>
          )}
        </dl>

        {role === "seller" && trade.status === "paid" && (
          <div className="space-y-2">
            {qrCode ? (
              <>
                <MockQr code={qrCode} />
                <p className="text-center text-xs text-muted-foreground">
                  우체국에서 이 QR을 보여주면 접수돼요 (체험판)
                </p>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={pending}
                  onClick={() =>
                    run(() => markUsedShipped(trade.id), "발송 처리했어요")
                  }
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
                    const result = await issueUsedPostQr(trade.id);
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

        {role === "buyer" && trade.status === "shipped" && (
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={pending}
            onClick={() =>
              run(() => confirmUsedReceived(trade.id), "거래가 완료됐어요!")
            }
          >
            <PackageCheck className="h-4 w-4" />
            수령 확정
          </Button>
        )}
        {role === "buyer" && trade.status === "paid" && (
          <p className="text-xs text-muted-foreground">
            판매자가 발송을 준비하고 있어요. 발송되면 알려드릴게요.
          </p>
        )}
        {trade.status === "shipped" && trade.postTrackingCode && (
          <p className="text-center text-xs text-muted-foreground">
            등기번호 <span className="font-mono">{trade.postTrackingCode}</span>
          </p>
        )}
      </div>
    );
  }

  // ── 판매자 본인 (거래 전) ──
  if (role === "seller") {
    return (
      <div className="space-y-2 rounded-md border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">내가 올린 매물이에요.</p>
        {listing.status === "active" && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(() => cancelUsedListing(listing.id), "매물을 내렸어요")
            }
          >
            판매 취소
          </Button>
        )}
      </div>
    );
  }

  // ── 경매 입찰 — 스토어 AuctionPanel과 동일한 구성(현재가·최소 인상폭·
  //    빠른 인상 칩·유의사항)으로 UX를 맞춘다. ──
  if (isAuction) {
    const current = listing.auctionCurrentPrice ?? null;
    const start = listing.auctionStartPrice ?? 0;
    const increment = bidIncrementFor(current ?? start);
    const endsLabel = listing.auctionEndsAt
      ? remainingLabel(listing.auctionEndsAt, new Date())
      : null;
    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-md border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Gavel className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="text-primary">입찰 경매</span>
            <span className="ml-auto flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {endsLabel === null
                ? "…"
                : endsLabel === "마감"
                  ? "마감 처리 중"
                  : `${endsLabel} 남음`}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {current === null ? "시작가" : "현재 최고 입찰가"}
            </p>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-foreground">
                ₩{(current ?? start).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                입찰 {listing.auctionBidCount}건
              </span>
            </div>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
            <span>시작가 ₩{start.toLocaleString()}</span>
            <span>최소 인상폭 ₩{increment.toLocaleString()}</span>
          </div>
        </div>

        {auctionLive ? (
          <div className="space-y-2">
            <div className="flex items-stretch gap-2">
              <UsedWishlistButton
                listingId={listing.id}
                initialWished={wished}
                isLoggedIn={isLoggedIn}
                variant="detail"
                className="h-10 px-3.5"
              />
              <Input
                value={bidAmount}
                onChange={(e) =>
                  setBidAmount(e.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                aria-label="입찰 금액"
                className="h-10 flex-1"
              />
              <Button
                disabled={pending || !bidAmount}
                onClick={requestBid}
                className="shrink-0"
              >
                입찰하기
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                최소 ₩{min.toLocaleString()} ·
              </span>
              {[1, 2, 5].map((mult) => (
                <Button
                  key={mult}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2.5 text-xs"
                  onClick={() =>
                    setBidAmount(
                      String((current ?? start - increment) + increment * mult),
                    )
                  }
                >
                  +₩{(increment * mult).toLocaleString()}
                </Button>
              ))}
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <b className="text-foreground">입찰 전 확인</b> — 입찰은 취소할
              수 없어요. 낙찰되면 안전거래로 결제·배송이 진행되고, 마감 5분 전
              입찰은 마감을 5분 연장해요.
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            종료된 경매예요.
          </p>
        )}
        {/* 입찰 확인 — 취소 불가·안전거래 진행을 한 번 더 알리고 확정한다. */}
        <Dialog open={bidConfirmOpen} onOpenChange={setBidConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>이 금액으로 입찰할까요?</DialogTitle>
            </DialogHeader>
            <p className="text-center font-display text-3xl text-primary">
              ₩{(Number(String(bidAmount).replace(/[^0-9]/g, "")) || 0).toLocaleString()}
            </p>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              입찰은 <b className="text-foreground">취소할 수 없어요</b>.
              낙찰되면 안전거래로 결제·배송이 진행돼요.
            </div>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={bid} disabled={pending}>
                입찰 확정
              </Button>
              <Button
                variant="ghost"
                onClick={() => setBidConfirmOpen(false)}
                disabled={pending}
              >
                다시 생각해볼게요
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <LoginPromptDialog
          feature="bid"
          open={loginPromptOpen}
          onOpenChange={setLoginPromptOpen}
        />
      </div>
    );
  }

  // ── 고정가 구매 ──
  if (listing.status !== "active") {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        지금은 구매할 수 없는 매물이에요.
      </div>
    );
  }
  return (
    <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
      {/* 찜은 구매 버튼 왼쪽 — 스토어 상세의 leadingAction과 같은 자리. */}
      <div className="flex items-stretch gap-2">
        <UsedWishlistButton
          listingId={listing.id}
          initialWished={wished}
          isLoggedIn={isLoggedIn}
          variant="detail"
        />
        <DialogTrigger asChild>
          <Button
            size="lg"
            className="h-13 flex-1"
            onClick={(e) => {
              if (!isLoggedIn) {
                e.preventDefault();
                setLoginPromptOpen(true);
              }
            }}
          >
            ₩{buyerTotal.toLocaleString()} 안전거래로 구매
          </Button>
        </DialogTrigger>
      </div>
      <LoginPromptDialog
        feature="checkout"
        open={loginPromptOpen}
        onOpenChange={setLoginPromptOpen}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>배송지 입력</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="받는 사람"
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="연락처"
            inputMode="tel"
          />
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="주소"
          />
          {maxPoints > 0 && (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground">
                포인트 사용 (보유 {pointBalance.toLocaleString()}P · 최대{" "}
                {maxPoints.toLocaleString()}P)
              </p>
              <div className="flex gap-2">
                <Input
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  onBlur={() => setPointsInput(String(usePoints))}
                  inputMode="numeric"
                  className="h-9 flex-1"
                  aria-label="사용할 포인트"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setPointsInput(String(maxPoints))}
                >
                  전액 사용
                </Button>
              </div>
              {usePoints > 0 && (
                <p className="text-xs text-primary">
                  -{usePoints.toLocaleString()}P 적용 — 결제 금액 ₩
                  {buyerTotal.toLocaleString()}
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            결제는 체험판이라 실제로 청구되지 않아요. 확정 시 판매자에게 발송이
            요청됩니다.
          </p>
          <Button
            className="w-full"
            disabled={pending || !name || !phone || address.length < 5}
            onClick={buy}
          >
            {pending ? "처리 중…" : `₩${buyerTotal.toLocaleString()} 결제하고 구매 확정`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
