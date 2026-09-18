import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  Clock,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getProductsByIds } from "@/modules/products/lib/queries";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";
import { ProductImage } from "@/modules/products/components/ProductImage";
import {
  activeBidSummaries,
  listMyBidSummaries,
  type MyBidSummary,
} from "../lib/my-bids";
import { remainingLabel } from "../lib/rules";

// 홈 배너 아래 '내 입찰 현황' — 액션이 필요한 것(결제 대기·진행중)만 컴팩트하게.
// 비로그인·입찰 없음이면 아무것도 렌더하지 않는다.
export async function MyBidsStrip() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const active = activeBidSummaries(await listMyBidSummaries(account.id));
  if (active.length === 0) return null;

  const products = await getProductsByIds(active.map((s) => s.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const now = new Date();

  function statusChip(s: MyBidSummary) {
    if (s.status === "awarded_unpaid") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
          <Trophy className="h-2.5 w-2.5" /> 낙찰 · 결제하기
        </span>
      );
    }
    if (s.status === "winning") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
          <Trophy className="h-2.5 w-2.5" /> 최고가
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
        <TriangleAlert className="h-2.5 w-2.5" /> 추월당함
      </span>
    );
  }

  return (
    <section aria-label="내 입찰 현황" className="space-y-2.5" data-page-section>
      {/* 다른 홈 섹션(JUST ARRIVED 등)과 같은 헤딩·전체보기 스타일로 통일. */}
      <div className="kawaii-section-heading">
        <div>
          <span>MY BIDS</span>
          <h2>내 입찰 현황</h2>
        </div>
        <Link href="/mypage/bids" className="kawaii-more-link">
          전체 보기 ({active.length}건) <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {/* 가장 우선순위 높은 1건만 화면 폭을 가득 채워 보여준다(나머지는 '전체 보기'로). */}
      <div>
        {active.slice(0, 1).map((s) => {
          const product = productById.get(s.productId);
          if (!product) return null;
          const urgent = s.status === "awarded_unpaid";
          return (
            <Link
              key={s.productId}
              href={`/products/${s.productId}`}
              className={cn(
                "flex w-full gap-3 rounded-xl border bg-card p-3 shadow-card transition-transform hover:-translate-y-0.5",
                urgent ? "border-primary/60 bg-primary/5" : "border-border",
              )}
            >
              <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-md border border-border bg-lilac">
                <ProductImage
                  src={productGridThumbnailUrl(s.productId)}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                {statusChip(s)}
                <p className="line-clamp-1 text-xs font-semibold text-foreground">
                  {product.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {urgent ? "낙찰가" : "현재가"} ₩
                  {(s.currentPrice ?? s.myMaxBid).toLocaleString()}
                </p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  {urgent && s.payDueAt
                    ? `결제 기한 ${remainingLabel(s.payDueAt, now)} 남음`
                    : s.endsAt
                      ? `마감 ${remainingLabel(s.endsAt, now)} 남음`
                      : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
