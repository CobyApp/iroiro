import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Coins,
  FileEdit,
  Gavel,
  Package,
  ShoppingBag,
  Star,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatKstRelative } from "@/lib/datetime";
import {
  PRODUCT_CONDITION_LABEL,
  SALE_STATUS_LABEL,
  type SaleStatus,
} from "@/modules/products/types";
import { RECENT_WINDOW_DAYS } from "../lib/queries";
import type { DashboardData } from "../types";

type Props = {
  data: DashboardData;
  publicBaseUrl: string;
};

const SALE_STATUS_BADGE: Record<
  SaleStatus,
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  active: {
    variant: "default",
    className: "bg-emerald-600 hover:bg-emerald-600",
  },
  draft: { variant: "secondary" },
  archived: { variant: "outline" },
};

const CONDITION_LABEL: Record<string, string> = {
  ...PRODUCT_CONDITION_LABEL,
  unspecified: "미지정",
};

function formatKrw(value: number): string {
  return `₩${value.toLocaleString("ko-KR")}`;
}

export function Dashboard({ data, publicBaseUrl }: Props) {
  const {
    business,
    stats,
    alerts,
    teamDistribution,
    recentProducts,
    conditionDistribution,
  } = data;

  const conditionTotal = conditionDistribution.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const teamMax = teamDistribution.reduce(
    (max, item) => Math.max(max, item.count),
    0,
  );

  return (
    <div className="space-y-6 p-6">
      <h2 className="font-display text-2xl">대시보드</h2>

      {/* Tier 0 — 비즈니스 현황 (매출·주문·경매·회원) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="오늘 매출"
          value={formatKrw(business.todaySalesKrw)}
          detail={
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>주문 {business.todayOrderCount}건</span>
              <span>·</span>
              <span>7일 {formatKrw(business.weekSalesKrw)}</span>
              <span>·</span>
              <span>누적 {formatKrw(business.totalSalesKrw)}</span>
            </div>
          }
        />
        <StatCard
          icon={<Truck className="h-5 w-5" />}
          label="발송 대기"
          value={`${business.awaitingShipmentCount}건`}
          detail={
            <Link
              href="/admin/orders?status=paid"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              주문 관리에서 발송 처리 →
            </Link>
          }
          tone={business.awaitingShipmentCount > 0 ? "warning" : "default"}
        />
        <StatCard
          icon={<Gavel className="h-5 w-5" />}
          label="진행중 경매"
          value={`${business.liveAuctionCount}건`}
          detail={
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>24시간 내 마감 {business.endingSoonAuctionCount}</span>
              <span>·</span>
              <span>낙찰 결제 대기 {business.awardedUnpaidCount}</span>
            </div>
          }
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="회원"
          value={`${business.memberCount.toLocaleString()}명`}
          detail={
            <p className="text-xs text-muted-foreground">
              최근 7일 신규 +{business.newMemberCount}
            </p>
          }
        />
      </div>

      {/* Tier 0.5 — 고객 반응·부채 한 줄 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniStat
          icon={<Star className="h-4 w-4" />}
          label="리뷰"
          value={
            business.reviewCount === 0
              ? "아직 없음"
              : `${business.reviewCount}건 · 평균 ${business.reviewAverage ?? "-"}점`
          }
          href="/admin/reviews"
        />
        <MiniStat
          icon={<Coins className="h-4 w-4" />}
          label="유통 포인트"
          value={`${business.outstandingPointsKrw.toLocaleString()}P`}
          href="/admin/points"
        />
        <MiniStat
          icon={<ShoppingBag className="h-4 w-4" />}
          label="주문 관리"
          value="전체 주문 보기"
          href="/admin/orders"
        />
      </div>

      {/* Tier 1 — 스냅샷 카드 4개 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="총 상품"
          value={stats.totalProducts.toString()}
          detail={
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>판매중 {stats.byStatus.active}</span>
              <span>·</span>
              <span>임시저장 {stats.byStatus.draft}</span>
              <span>·</span>
              <span>보관 {stats.byStatus.archived}</span>
            </div>
          }
        />
        <StatCard
          icon={<Archive className="h-5 w-5" />}
          label="재고 가치"
          value={formatKrw(stats.inventoryValueKrw)}
          detail={
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>전체 상품 실판매가 × 재고 수량 합계</p>
              <p>(할인가 있으면 할인가, 없으면 정가)</p>
            </div>
          }
        />
        <StatCard
          icon={<FileEdit className="h-5 w-5" />}
          label="매입 원가"
          value={formatKrw(stats.purchaseCostKrw)}
          detail={
            <p className="text-xs text-muted-foreground">
              전체 상품 매입가 × 재고 수량 합계
            </p>
          }
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="운영 알림"
          value={
            stats.outOfStockHasMore
              ? `${stats.outOfStockCount}+`
              : stats.outOfStockCount.toString()
          }
          detail={
            <p className="text-xs text-muted-foreground">
              재고 없음 (
              {stats.outOfStockHasMore
                ? `${stats.outOfStockCount}+`
                : stats.outOfStockCount}
              건)
            </p>
          }
          tone={stats.outOfStockCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Tier 2 — 운영 위젯 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>작업 알림</CardTitle>
            <p className="text-xs text-muted-foreground">
              재고 없음 · 최근 수정 순 최대 10건
            </p>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                지금 처리할 알림이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {alerts.map((alert) => (
                  <li key={alert.productId}>
                    <Link
                      href={`/admin/products/${alert.productId}/edit`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
                    >
                      {alert.thumbnailR2Key ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${publicBaseUrl}/${alert.thumbnailR2Key}`}
                          alt={alert.productName}
                          className="h-10 w-10 rounded-xs object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xs bg-muted" />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {alert.productName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {alert.detail}
                        </div>
                      </div>
                      <Badge
                        variant={SALE_STATUS_BADGE[alert.saleStatus].variant}
                        className={SALE_STATUS_BADGE[alert.saleStatus].className}
                      >
                        {SALE_STATUS_LABEL[alert.saleStatus]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>그룹별 카탈로그</CardTitle>
          </CardHeader>
          <CardContent>
            {teamDistribution.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                등록된 상품이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {teamDistribution.map((row) => {
                  const widthPct =
                    teamMax > 0 ? Math.max(4, (row.count / teamMax) * 100) : 0;
                  return (
                    <li
                      key={row.teamId === null ? "_unset_" : row.teamId}
                      className="space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{row.teamName}</span>
                        <span className="text-muted-foreground">
                          {row.count}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tier 3 — 분석 위젯 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>최근 등록 상품</CardTitle>
            <p className="text-xs text-muted-foreground">
              최근 {RECENT_WINDOW_DAYS}일 이내 등록 · 최근 등록순 최대 10건
            </p>
          </CardHeader>
          <CardContent>
            {recentProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                최근 {RECENT_WINDOW_DAYS}일 이내 등록된 상품이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentProducts.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
                    >
                      {product.thumbnailR2Key ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${publicBaseUrl}/${product.thumbnailR2Key}`}
                          alt={product.name}
                          className="h-10 w-10 rounded-xs object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xs bg-muted" />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatKstRelative(product.createdAt)}
                        </div>
                      </div>
                      <Badge
                        variant={
                          SALE_STATUS_BADGE[product.saleStatus].variant
                        }
                        className={
                          SALE_STATUS_BADGE[product.saleStatus].className
                        }
                      >
                        {SALE_STATUS_LABEL[product.saleStatus]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>상품 상태 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {conditionTotal === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                등록된 상품이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {conditionDistribution
                  .filter((row) => row.count > 0)
                  .map((row) => {
                    const pct = (row.count / conditionTotal) * 100;
                    return (
                      <li key={row.condition} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{CONDITION_LABEL[row.condition]}</span>
                          <span className="text-muted-foreground">
                            {row.count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// 한 줄짜리 보조 지표 + 이동 링크 — 카드보다 낮은 시각 위계.
function MiniStat({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </Link>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span
            className={cn(
              "text-muted-foreground",
              tone === "warning" && "text-destructive",
            )}
          >
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div
          className={cn(
            "text-2xl font-bold",
            tone === "warning" && "text-destructive",
          )}
        >
          {value}
        </div>
        {detail}
      </CardContent>
    </Card>
  );
}
