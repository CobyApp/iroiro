"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatKstDateTime } from "@/lib/datetime";
import { adminDeleteReview } from "../actions";
import { ReviewStars } from "./ReviewStars";
import type { AdminReviewRow } from "../lib/admin-queries";

export function AdminReviewsTable({ reviews }: { reviews: AdminReviewRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(reviewId: number) {
    if (!window.confirm("이 리뷰를 삭제할까요? 되돌릴 수 없어요.")) return;
    startTransition(async () => {
      const result = await adminDeleteReview({ reviewId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("리뷰를 삭제했어요");
      router.refresh();
    });
  }

  if (reviews.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        아직 리뷰가 없습니다
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">상품</th>
            <th className="px-4 py-2.5 font-medium">작성자</th>
            <th className="px-4 py-2.5 font-medium">별점</th>
            <th className="px-4 py-2.5 font-medium">내용</th>
            <th className="px-4 py-2.5 font-medium">작성일시</th>
            <th className="px-4 py-2.5 font-medium">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {reviews.map((review) => (
            <tr key={review.id}>
              <td className="max-w-[200px] px-4 py-2.5">
                <Link
                  href={`/products/${review.productId}`}
                  className="line-clamp-1 underline-offset-2 hover:underline"
                >
                  {review.productName}
                </Link>
              </td>
              <td className="px-4 py-2.5">{review.reviewerName}</td>
              <td className="px-4 py-2.5">
                <ReviewStars rating={review.rating} />
              </td>
              <td className="max-w-[280px] px-4 py-2.5">
                <span className="line-clamp-2 text-xs">
                  {review.body || (
                    <span className="text-muted-foreground">(내용 없음)</span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {formatKstDateTime(review.createdAt)}
              </td>
              <td className="px-4 py-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                  onClick={() => remove(review.id)}
                  disabled={pending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
