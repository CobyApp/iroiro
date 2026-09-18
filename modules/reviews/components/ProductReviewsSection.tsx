import { BadgeCheck } from "lucide-react";
import { listProductReviews } from "../lib/queries";
import { ReviewStars } from "./ReviewStars";

function agoLabel(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return "방금";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}달 전`;
}

// 상품 상세 하단 리뷰 섹션 — 전부 구매 검증된 도착 인증 리뷰만 존재한다.
export async function ProductReviewsSection({
  productId,
  viewerAccountId,
}: {
  productId: number;
  viewerAccountId: string | null;
}) {
  const { reviews, summary } = await listProductReviews(
    productId,
    viewerAccountId,
  );
  if (summary.count === 0) return null;

  return (
    <section className="space-y-3" data-page-section aria-label="상품 리뷰">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">
          리뷰{" "}
          <span className="font-normal text-muted-foreground">
            ({summary.count}건)
          </span>
        </h2>
        {summary.average !== null && (
          <span className="flex items-center gap-1.5 text-sm">
            <ReviewStars rating={Math.round(summary.average)} />
            <b className="text-foreground">{summary.average}</b>
          </span>
        )}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {reviews.map((review) => (
          <li key={review.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ReviewStars rating={review.rating} />
                {review.reviewer}
                {review.isMine && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    내 리뷰
                  </span>
                )}
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <BadgeCheck className="h-3 w-3" aria-hidden />
                  구매 확인
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {agoLabel(review.createdAt)}
              </span>
            </div>
            {review.body && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {review.body}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
