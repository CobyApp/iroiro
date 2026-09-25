"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Gavel, PackageCheck } from "lucide-react";
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
import { ShipmentForm } from "@/components/ShipmentForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { courierLabel, courierTrackingUrl } from "@/lib/shipping/couriers";
import { UsedWishlistButton } from "./UsedWishlistButton";
import {
  buyUsedListing,
  cancelUsedListing,
  cancelUsedTradeForRefund,
  confirmUsedReceived,
  markUsedHandedOver,
  markUsedShipped,
  placeUsedBid,
} from "../actions";
import {
  USED_TRADE_STATUS_LABEL,
  type UsedListingWithPhotos,
  type UsedTrade,
  type UsedTradeKind,
} from "../types";
import { MeetLocationMap } from "./MeetLocationMap";

type Role = "seller" | "buyer" | "visitor";

export function UsedDetailCta({
  listing,
  trade,
  role,
  isLoggedIn,
  wished = false,
  pointBalance = 0,
  autoConfirmNote = null,
}: {
  listing: UsedListingWithPhotos;
  trade: UsedTrade | null;
  role: Role;
  isLoggedIn: boolean;
  wished?: boolean;
  /** 보유 포인트 — 구매 다이얼로그 포인트 사용 UI용. */
  pointBalance?: number;
  /** 배송추적 현재 상태(발송 후) — 우체국 어댑터 조회 결과. */
  tracking?: { stateLabel: string; isMock: boolean } | null;
  /** 발송됨일 때 "N일 후 자동 구매확정" 안내(서버 계산). */
  autoConfirmNote?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buyOpen, setBuyOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [bidConfirmOpen, setBidConfirmOpen] = useState(false);
  const [pointsInput, setPointsInput] = useState("0");

  // 이 매물이 허용하는 거래 방식 — 구매자가 택배/직거래 중 선택. 하나뿐이면 그것으로 고정.
  const availableKinds = [
    ...(listing.parcelEnabled ? (["parcel"] as const) : []),
    ...(listing.directEnabled ? (["direct"] as const) : []),
  ] as UsedTradeKind[];
  const [tradeKind, setTradeKind] = useState<UsedTradeKind>(
    availableKinds[0] ?? "parcel",
  );
  const isDirectBuy = tradeKind === "direct";

  const isAuction = listing.saleMode === "auction";
  const auctionLive = isAuction && listing.auctionStatus === "live";
  // 포인트는 상품가까지(배송비 제외) — 서버가 같은 규칙으로 재검증.
  const maxPoints = Math.max(0, Math.min(pointBalance, listing.price ?? 0));
  const usePoints = Math.max(
    0,
    Math.min(Number(pointsInput.replace(/[^0-9]/g, "")) || 0, maxPoints),
  );
  // 직거래는 배송비 없음(대면 수령).
  const effShippingFee = isDirectBuy ? 0 : listing.shippingFee;
  const buyerTotal = Math.max(0, (listing.price ?? 0) - usePoints + effShippingFee);

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
        tradeKind,
        // 직거래는 배송지가 없다.
        recipientName: isDirectBuy ? undefined : name,
        recipientPhone: isDirectBuy ? undefined : phone,
        recipientAddress: isDirectBuy ? undefined : address,
        usePoints,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // 리다이렉트 결제(카카오페이 등) — 결제창으로 이동. 승인 후 상세로 되돌아온다.
      if (result.data.redirectUrl) {
        window.location.href = result.data.redirectUrl;
        return;
      }
      toast.success("구매 완료! 판매자가 발송을 준비해요");
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

        {role === "seller" && trade.status === "paid" && trade.tradeKind === "parcel" && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              택배 접수 후 택배사·송장번호를 입력하면 발송 완료돼요.
            </p>
            <ShipmentForm
              pending={pending}
              onSubmit={(courier, trackingCode) =>
                run(
                  () => markUsedShipped(trade.id, { courier, trackingCode }),
                  "발송 처리했어요",
                )
              }
            />
          </div>
        )}

        {/* 직거래 — 판매자 대면 전달 표시 */}
        {role === "seller" && trade.status === "paid" && trade.tradeKind === "direct" && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              구매자와 만나 물건을 전달했다면 표시하세요. 이후 구매자가 수령확정하거나 3일 뒤 자동 확정돼요.
            </p>
            <ConfirmDialog
              title="전달을 표시할까요?"
              description="만나서 물건을 전달한 뒤에 눌러주세요."
              confirmLabel="전달 완료"
              pending={pending}
              onConfirm={() => run(() => markUsedHandedOver(trade.id), "전달을 표시했어요")}
              trigger={
                <Button size="sm" className="w-full gap-1.5" disabled={pending}>
                  <PackageCheck className="h-4 w-4" />
                  전달 완료 표시
                </Button>
              }
            />
          </div>
        )}

        {/* 직거래 — 구매자 수령확정(만나서 받으면 바로, 또는 전달표시 후) */}
        {role === "buyer" &&
          trade.tradeKind === "direct" &&
          (trade.status === "paid" || trade.status === "handed_over") && (
            <div className="space-y-2">
              <ConfirmDialog
                title="수령을 확정할까요?"
                description="만나서 물건을 받은 뒤에 눌러주세요. 확정하면 판매자에게 정산돼요."
                confirmLabel="수령 확정"
                pending={pending}
                onConfirm={() => run(() => confirmUsedReceived(trade.id), "거래가 완료됐어요!")}
                trigger={
                  <Button size="sm" className="w-full gap-1.5" disabled={pending}>
                    <PackageCheck className="h-4 w-4" />
                    수령 확정
                  </Button>
                }
              />
              <p className="text-center text-xs text-muted-foreground">
                아직 못 만났다면 확정하지 마세요. 문제가 있으면 취소·환불하세요.
              </p>
            </div>
          )}

        {/* 발송/전달 전(paid) — 취소=환불(구매자·판매자 모두) */}
        {trade.status === "paid" && (role === "buyer" || role === "seller") && (
          <ConfirmDialog
            title={role === "buyer" ? "구매를 취소할까요?" : "거래를 취소할까요?"}
            description="아직 발송·전달 전이라 전액 환불돼요. 사용한 포인트도 돌려드려요."
            confirmLabel="취소하고 환불"
            destructive
            pending={pending}
            onConfirm={() =>
              run(() => cancelUsedTradeForRefund(trade.id), "취소·환불했어요")
            }
            trigger={
              <Button variant="outline" size="sm" className="w-full" disabled={pending}>
                {role === "buyer" ? "구매 취소·환불" : "거래 취소·환불"}
              </Button>
            }
          />
        )}

        {role === "buyer" && trade.status === "shipped" && (
          <div className="space-y-2">
            <ConfirmDialog
              title="수령을 확정할까요?"
              description="확정하면 판매자에게 정산돼요. 상품을 실제로 받은 뒤에 눌러주세요."
              confirmLabel="수령 확정"
              pending={pending}
              onConfirm={() =>
                run(() => confirmUsedReceived(trade.id), "거래가 완료됐어요!")
              }
              trigger={
                <Button size="sm" className="w-full gap-1.5" disabled={pending}>
                  <PackageCheck className="h-4 w-4" />
                  수령 확정
                </Button>
              }
            />
            {autoConfirmNote && (
              <p className="text-center text-xs text-muted-foreground">
                {autoConfirmNote}
              </p>
            )}
          </div>
        )}
        {role === "buyer" && trade.status === "paid" && trade.tradeKind === "parcel" && (
          <p className="text-xs text-muted-foreground">
            판매자가 발송을 준비하고 있어요. 발송되면 알려드릴게요.
          </p>
        )}
        {trade.status === "shipped" && trade.postTrackingCode && (
          <div className="space-y-0.5 border-t border-border pt-2 text-center text-xs text-muted-foreground">
            <p>
              {courierLabel(trade.courier)}{" "}
              <span className="font-mono">{trade.postTrackingCode}</span>
            </p>
            {courierTrackingUrl(trade.courier, trade.postTrackingCode) && (
              <a
                href={courierTrackingUrl(trade.courier, trade.postTrackingCode)!}
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

  // ── 판매자 본인 (거래 전) ──
  if (role === "seller") {
    return (
      <div className="space-y-2 rounded-md border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">내가 올린 매물이에요.</p>
        <div className="flex items-stretch gap-2">
          <UsedWishlistButton
            listingId={listing.id}
            initialWished={wished}
            isLoggedIn={isLoggedIn}
            variant="detail"
            className="h-9 px-3.5"
          />
          {listing.status === "active" && (
            <ConfirmDialog
              title="판매를 취소할까요?"
              description="매물이 목록에서 내려가요. 다시 올리려면 새로 등록해야 해요."
              confirmLabel="판매 취소"
              destructive
              pending={pending}
              onConfirm={() =>
                run(() => cancelUsedListing(listing.id), "매물을 내렸어요")
              }
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1"
                  disabled={pending}
                >
                  판매 취소
                </Button>
              }
            />
          )}
        </div>
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
          <DialogTitle>{isDirectBuy ? "직거래로 구매" : "배송지 입력"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          {/* 거래 방식 선택 — 둘 다 가능한 매물일 때만 */}
          {availableKinds.length > 1 && (
            <div className="flex gap-2">
              {availableKinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTradeKind(k)}
                  className={[
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    tradeKind === k
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                  ].join(" ")}
                >
                  {k === "parcel" ? "택배" : "직거래"}
                </button>
              ))}
            </div>
          )}

          {isDirectBuy ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground">
                만나서 거래해요. 결제는 안전거래로 진행되고, 받은 뒤 수령확정하면 판매자에게 정산돼요. 배송비는 없어요.
              </p>
              {listing.meetLocations.length > 0 ? (
                <MeetLocationMap locations={listing.meetLocations} />
              ) : (
                <p className="text-xs text-muted-foreground">판매자와 만날 장소는 결제 후 쪽지로 정하세요.</p>
              )}
            </div>
          ) : (
            <>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="받는 사람" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처" inputMode="tel" />
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" />
            </>
          )}
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
            카카오페이 안전결제 — 수령 확정 시 판매자에게 정산돼요.
          </p>
          <Button
            className="w-full"
            disabled={pending || (!isDirectBuy && (!name || !phone || address.length < 5))}
            onClick={buy}
          >
            {pending ? "처리 중…" : `₩${buyerTotal.toLocaleString()} 결제하고 구매 확정`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
