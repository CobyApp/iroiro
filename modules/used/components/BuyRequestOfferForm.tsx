"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createBuyOffer } from "../buy-actions";
import { BUY_OFFER_MESSAGE_MAX } from "../lib/buy-schema";

type MyListing = { id: number; title: string };

const selectClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary/50";

// 오퍼(팔게요) 보내기 — 로그인·비요청자에게만 노출. 가격 필수, 메시지·연결 매물 선택.
export function BuyRequestOfferForm({
  requestId,
  myListings,
}: {
  requestId: number;
  myListings: MyListing[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [listingId, setListingId] = useState<number | "">("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("가격을 입력해주세요");
      return;
    }
    startTransition(async () => {
      const result = await createBuyOffer({
        requestId,
        price: priceNum,
        message: message.trim() || null,
        listingId: listingId === "" ? null : Number(listingId),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("오퍼를 보냈어요");
      setPrice("");
      setMessage("");
      setListingId("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="font-medium text-foreground">팔게요 (오퍼 보내기)</p>
      <div className="space-y-2">
        <Label htmlFor="offer-price">제안 가격 (원, 개당)</Label>
        <Input
          id="offer-price"
          type="number"
          inputMode="numeric"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="예: 15000"
          required
        />
      </div>
      {myListings.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="offer-listing">연결할 내 매물 (선택)</Label>
          <select
            id="offer-listing"
            className={selectClass}
            value={listingId}
            onChange={(e) => setListingId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">연결 안 함</option>
            {myListings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="offer-message">메시지 (선택)</Label>
        <Textarea
          id="offer-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="상태·거래 방식 등을 알려주세요"
          rows={3}
          maxLength={BUY_OFFER_MESSAGE_MAX}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "보내는 중..." : "오퍼 보내기"}
      </Button>
    </form>
  );
}
