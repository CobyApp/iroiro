"use client";

import { useState } from "react";
import { PencilLine, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReviewForm } from "./ReviewForm";

type Props = {
  orderId: number;
  productId: number;
  productName: string;
  existing?: { id: number; rating: number; body: string };
};

// 주문 상세의 상품별 리뷰 진입점 — 작성 전엔 "리뷰 쓰기", 작성 후엔 "리뷰 수정".
export function OrderItemReviewButton({
  orderId,
  productId,
  productName,
  existing,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 rounded-full px-2.5 text-xs"
        >
          {existing ? (
            <>
              <PencilLine className="h-3 w-3" aria-hidden />
              리뷰 수정
            </>
          ) : (
            <>
              <Star className="h-3 w-3" aria-hidden />
              리뷰 쓰기
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "리뷰 수정" : "도착 인증 리뷰"}</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {productName}
          </DialogDescription>
        </DialogHeader>
        <ReviewForm
          orderId={orderId}
          productId={productId}
          existing={existing}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
