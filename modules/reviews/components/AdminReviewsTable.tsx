"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        아직 리뷰가 없습니다
      </p>
    );
  }

  // 폰에서는 표가 가로 스크롤된다(Table 래퍼 overflow) — 열 폭이 무너지지 않게 최소 폭을 둔다.
  return (
    <Table className="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <TableHead>상품</TableHead>
          <TableHead>작성자</TableHead>
          <TableHead>별점</TableHead>
          <TableHead>내용</TableHead>
          <TableHead>작성일시</TableHead>
          <TableHead>관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reviews.map((review) => (
          <TableRow key={review.id}>
            <TableCell className="max-w-[200px] py-2.5">
              <Link
                href={`/products/${review.productId}`}
                className="line-clamp-1 underline-offset-2 hover:underline"
              >
                {review.productName}
              </Link>
            </TableCell>
            <TableCell className="py-2.5">{review.reviewerName}</TableCell>
            <TableCell className="py-2.5">
              <ReviewStars rating={review.rating} />
            </TableCell>
            <TableCell className="max-w-[280px] py-2.5">
              <span className="line-clamp-2 text-xs">
                {review.body || (
                  <span className="text-muted-foreground">(내용 없음)</span>
                )}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
              {formatKstDateTime(review.createdAt)}
            </TableCell>
            <TableCell className="py-2.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                onClick={() => remove(review.id)}
                disabled={pending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
