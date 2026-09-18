"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { upsertReview, deleteReview } from "../actions";
import { MAX_REVIEW_BODY } from "../lib/schema";

type Props = {
  orderId: number;
  productId: number;
  /** 기존 리뷰 — 있으면 수정 모드(별점·내용 프리필 + 삭제 버튼). */
  existing?: { id: number; rating: number; body: string };
  /** 저장·삭제 완료 후 호출 — 다이얼로그 닫기용. */
  onDone?: () => void;
};

export function ReviewForm({ orderId, productId, existing, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [body, setBody] = useState(existing?.body ?? "");

  function submit() {
    startTransition(async () => {
      const result = await upsertReview({ orderId, productId, rating, body });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.data.pointsGranted > 0
          ? `리뷰 고마워요! +${result.data.pointsGranted}P 적립됐어요`
          : existing
            ? "리뷰를 수정했어요"
            : "리뷰를 남겼어요. 고마워요!",
      );
      router.refresh();
      onDone?.();
    });
  }

  function remove() {
    if (!existing) return;
    startTransition(async () => {
      const result = await deleteReview({ reviewId: existing.id });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("리뷰를 삭제했어요");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">별점</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              disabled={pending}
              aria-label={`${n}점`}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  n <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "fill-muted text-muted hover:text-amber-300",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">
          리뷰 <span className="font-normal text-muted-foreground">(선택)</span>
        </p>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_REVIEW_BODY}
          rows={4}
          placeholder="카드 상태, 배송, 포장은 어땠나요?"
          disabled={pending}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} className="flex-1">
          {existing ? "리뷰 수정" : "리뷰 등록"}
        </Button>
        {existing && (
          <Button
            type="button"
            variant="outline"
            onClick={remove}
            disabled={pending}
            className="text-muted-foreground"
          >
            삭제
          </Button>
        )}
      </div>
    </div>
  );
}
