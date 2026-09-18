"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Gavel, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoginPromptDialog } from "@/modules/auth/components/LoginPromptDialog";
import { addCartItem } from "@/modules/cart/actions";
import { placeBid } from "../actions";
import {
  bidIncrementFor,
  minNextBid,
  remainingLabel,
} from "../lib/rules";
import type { BidRow } from "../lib/queries";

type Props = {
  productId: number;
  startPrice: number;
  currentPrice: number | null;
  bidCount: number;
  endsAt: string;
  status: "live" | "awarded" | "passed";
  isWinner: boolean;
  payDueAt: string | null;
  /** 낙찰자 결제 완료 여부(재고 0) — awarded 화면 분기용 */
  isSold: boolean;
  isLoggedIn: boolean;
  bids: BidRow[];
  /** 같은 카드의 최근 거래가(결제 완료 기준) */
  recentTrades: { price: number; agoLabel: string }[];
  /** 찜 버튼 슬롯 — 입찰 입력 줄 왼쪽(고정가의 leadingAction과 같은 자리). */
  wishlistSlot?: React.ReactNode;
};

function formatKrw(value: number): string {
  return `₩${value.toLocaleString("ko-KR")}`;
}

export function AuctionPanel({
  productId,
  startPrice,
  currentPrice,
  bidCount,
  endsAt,
  status,
  isWinner,
  payDueAt,
  isSold,
  isLoggedIn,
  bids,
  recentTrades,
  wishlistSlot,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showAllBids, setShowAllBids] = useState(false);

  const min = minNextBid(currentPrice, startPrice);
  const [amount, setAmount] = useState(String(min));
  // 경합으로 현재가가 바뀌면(입찰 성공/실패 후 refresh) 입력값을 새 최소가로 갱신 —
  // 스테일 금액으로 재시도했다가 또 거절당하는 상황을 막는다.
  // (effect 대신 렌더 중 상태 보정 — React 권장 패턴)
  const [lastMin, setLastMin] = useState(min);
  if (min !== lastMin) {
    setLastMin(min);
    setAmount(String(min));
  }

  // 남은 시간 — 서버/클라 시각 차로 인한 hydration 불일치를 피하려고
  // 마운트 후 인터벌에서만 갱신한다(SSR·첫 페인트는 자리표시).
  const [nowTick, setNowTick] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNowTick(new Date());
    const timer = setInterval(tick, 1000 * 30);
    const raf = requestAnimationFrame(tick);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, []);
  const remaining = nowTick ? remainingLabel(endsAt, nowTick) : null;

  // 입찰 버튼 → 확인 팝업 먼저(실수 방지), 팝업의 확정에서 실제 입찰.
  function requestBid() {
    if (!isLoggedIn) {
      setLoginPromptOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  function submitBid() {
    setConfirmOpen(false);
    const value = Number(String(amount).replace(/[^0-9]/g, ""));
    startTransition(async () => {
      const result = await placeBid({ productId, amount: value });
      if (!result.ok) {
        toast.error(result.message);
        router.refresh();
        return;
      }
      toast.success(
        `${formatKrw(value)} 입찰 완료! 현재 최고가예요 · 찜에 담아뒀어요`,
      );
      setAmount(
        String(result.data.currentPrice + bidIncrementFor(result.data.currentPrice)),
      );
      router.refresh();
    });
  }

  function buyAsWinner() {
    startTransition(async () => {
      const result = await addCartItem({ productId, quantity: 1 });
      if (!result.ok) {
        toast.error(result.message);
        router.refresh();
        return;
      }
      // 낙찰 구매는 단일 상품 확정 건 — 장바구니를 거치지 않고 바로 결제로.
      router.push("/checkout");
    });
  }

  // ── 종료 상태 ──────────────────────────────────────────
  if (status === "passed") {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        이번 경매는 유찰되었어요. 재경매 일정은 곧 안내됩니다.
      </div>
    );
  }

  if (status === "awarded") {
    if (isWinner && !isSold) {
      const payRemaining =
        payDueAt && nowTick ? remainingLabel(payDueAt, nowTick) : null;
      return (
        <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4">
          <p className="flex items-center gap-2 font-display text-base text-primary">
            <PartyPopper className="h-5 w-5" aria-hidden />
            축하해요! 이 경매의 낙찰자예요
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">낙찰가</span>
            <b className="text-2xl text-foreground">{formatKrw(currentPrice ?? 0)}</b>
          </div>
          {payRemaining && (
            <p className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              결제 기한 {payRemaining} 남음
              {payDueAt && (
                <span className="font-normal text-muted-foreground">
                  (
                  {new Date(payDueAt).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  까지)
                </span>
              )}
            </p>
          )}
          <Button className="w-full" onClick={buyAsWinner} disabled={pending}>
            낙찰가로 바로 결제하기
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            기한 내 결제하지 않으면 낙찰이 자동 취소되고, 미결제가 반복되면
            입찰 이용이 제한될 수 있어요.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {isSold ? "낙찰자 결제까지 완료된 경매예요." : "낙찰이 완료된 경매예요."}{" "}
        낙찰가 {formatKrw(currentPrice ?? 0)} · 입찰 {bidCount}건
      </div>
    );
  }

  // ── 진행 중 ────────────────────────────────────────────
  const increment = bidIncrementFor(currentPrice ?? startPrice);
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Gavel className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-primary">입찰 경매</span>
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {remaining === null ? "…" : remaining === "마감" ? "마감 처리 중" : `${remaining} 남음`}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {currentPrice === null ? "시작가" : "현재 최고 입찰가"}
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-foreground">
              {formatKrw(currentPrice ?? startPrice)}
            </span>
            <span className="text-xs text-muted-foreground">입찰 {bidCount}건</span>
          </div>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span>시작가 {formatKrw(startPrice)}</span>
          <span>최소 인상폭 {formatKrw(increment)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-stretch gap-2">
          {wishlistSlot}
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="입찰 금액"
            className="h-10 flex-1"
          />
          <Button onClick={requestBid} disabled={pending} className="shrink-0">
            입찰하기
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            최소 {formatKrw(min)} ·
          </span>
          {[1, 2, 5].map((mult) => (
            <Button
              key={mult}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              onClick={() => setAmount(String((currentPrice ?? startPrice - increment) + increment * mult))}
            >
              +{formatKrw(increment * mult)}
            </Button>
          ))}
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <b className="text-foreground">입찰 전 확인</b> — 입찰은 취소할 수
          없어요. 낙찰되면 <b className="text-foreground">48시간 내 결제</b>해야
          하며, 미결제 시 낙찰 취소·반복 시 이용 제한이 있을 수 있어요. 마감
          5분 전 입찰은 마감을 5분 연장해요.
        </div>
      </div>

      {bids.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              입찰 내역 <span className="font-normal text-muted-foreground">({bidCount}건)</span>
            </h2>
            {bids.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllBids((v) => !v)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showAllBids ? "접기" : `전체 ${bids.length}건 보기`}
              </button>
            )}
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {(showAllBids ? bids : bids.slice(0, 5)).map((bid, index) => (
              <li
                key={index}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {bid.bidder}
                  {bid.isMine && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      내 입찰
                    </span>
                  )}
                </span>
                <span className="font-medium text-foreground">
                  {formatKrw(bid.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentTrades.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            최근 거래가{" "}
            <span className="font-normal text-muted-foreground">
              (같은 카드 · 결제 완료 기준)
            </span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {recentTrades.map((trade, index) => (
              <li
                key={index}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {formatKrw(trade.price)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {trade.agoLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 입찰 확인 — 취소 불가·결제 의무를 한 번 더 알리고 확정한다. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>이 금액으로 입찰할까요?</DialogTitle>
          </DialogHeader>
          <p className="text-center font-display text-3xl text-primary">
            {formatKrw(Number(String(amount).replace(/[^0-9]/g, "")) || 0)}
          </p>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            입찰은 <b className="text-foreground">취소할 수 없어요</b>. 낙찰되면{" "}
            <b className="text-foreground">48시간 내 결제</b>해야 하며, 미결제
            시 낙찰이 취소되고 반복되면 이용이 제한될 수 있어요.
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={submitBid} disabled={pending}>
              입찰 확정
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
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
