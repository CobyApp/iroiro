"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatKstRelative } from "@/lib/datetime";
import {
  acceptBuyOffer,
  declineBuyOffer,
  withdrawBuyOffer,
} from "../buy-actions";
import {
  BUY_OFFER_STATUS_LABEL,
  type UsedBuyOfferWithMeta,
} from "../buy-types";

type Props = {
  offers: UsedBuyOfferWithMeta[];
  /** 뷰어가 요청 작성자인가 — 수락·거절 가능. */
  isOwner: boolean;
  /** 요청이 아직 모집중인가 — 종료·성사면 동작 숨김. */
  isOpen: boolean;
  /** 뷰어 계정 id — 자기 오퍼 철회 판단. */
  viewerAccountId: string | null;
};

// 오퍼 목록 — 요청자에게는 수락/거절, 오퍼 낸 판매자 본인에게는 철회를 노출.
export function BuyOfferList({ offers, isOwner, isOpen, viewerAccountId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "처리에 실패했어요");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  if (offers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
        아직 받은 오퍼가 없어요.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {offers.map((offer) => {
        const mine = viewerAccountId != null && offer.sellerAccountId === viewerAccountId;
        const isAccepted = offer.status === "accepted";
        return (
          <li
            key={offer.id}
            className={`rounded-xl border p-4 ${
              isAccepted ? "border-primary/60 bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg text-foreground">
                  ₩{offer.price.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  {offer.sellerName} · {formatKstRelative(offer.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                  isAccepted
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {BUY_OFFER_STATUS_LABEL[offer.status]}
              </span>
            </div>

            {offer.message && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{offer.message}</p>
            )}

            {offer.listingId != null && offer.listingTitle && (
              <Link
                href={`/used/${offer.listingId}`}
                className="mt-2 inline-block text-sm text-primary underline-offset-2 hover:underline"
              >
                연결 매물: {offer.listingTitle}
              </Link>
            )}

            {isOwner && isOpen && offer.status === "pending" && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => acceptBuyOffer({ offerId: offer.id }), "오퍼를 수락했어요")}
                >
                  수락
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => declineBuyOffer({ offerId: offer.id }), "오퍼를 거절했어요")}
                >
                  거절
                </Button>
              </div>
            )}

            {mine && offer.status === "pending" && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => withdrawBuyOffer({ offerId: offer.id }), "오퍼를 철회했어요")}
                >
                  철회
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
