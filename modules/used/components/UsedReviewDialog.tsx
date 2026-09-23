"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createUsedReview } from "../review-actions";
import { USED_REVIEW_COMMENT_MAX } from "../lib/schema";

// 중고 거래 후기 작성 — 거래·작성자당 1개(양방향). 별점 필수 + 코멘트 선택.
// counterpartLabel: 후기 대상 호칭(판매자/구매자) — 기본 "상대방".
export function UsedReviewDialog({
  tradeId,
  trigger,
  counterpartLabel = "상대방",
}: {
  tradeId: number;
  trigger?: React.ReactNode;
  counterpartLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");

  function submit() {
    if (rating < 1) {
      toast.error("별점을 선택해주세요");
      return;
    }
    startTransition(async () => {
      const result = await createUsedReview({
        tradeId,
        rating,
        comment: comment.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("후기를 남겼어요!");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            후기 남기기
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>거래 후기</DialogTitle>
          <DialogDescription>
            {counterpartLabel}와의 거래는 어떠셨나요? 별점과 후기를 남겨주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="별점">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}점`}
                aria-checked={rating === n}
                role="radio"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="p-0.5"
              >
                <Star
                  className={
                    "h-7 w-7 transition-colors " +
                    ((hover || rating) >= n
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40")
                  }
                />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="거래 경험을 남겨주세요 (선택)"
            rows={3}
            maxLength={USED_REVIEW_COMMENT_MAX}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            취소
          </Button>
          <Button type="button" onClick={submit} disabled={pending || rating < 1}>
            {pending ? "등록 중…" : "후기 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
