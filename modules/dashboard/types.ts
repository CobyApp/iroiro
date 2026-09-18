import type { ProductCondition, SaleStatus } from "@/modules/products/types";

export type DashboardStats = {
  totalProducts: number;
  byStatus: Record<SaleStatus, number>;
  inventoryValueKrw: number;
  purchaseCostKrw: number;
  /**
   * 작업 알림에 노출되는 재고 없음 카운트. LIMIT 11 트릭으로 최대 10까지만
   * 카운트하고 11번째 이상이 발견되면 `outOfStockHasMore=true`. 카드에서
   * "10+건"으로 표기.
   */
  outOfStockCount: number;
  outOfStockHasMore: boolean;
};

export type DashboardAlert = {
  productId: number;
  productName: string;
  thumbnailR2Key: string | null;
  saleStatus: SaleStatus;
  detail: string;
};

export type TeamDistribution = {
  teamId: number | null;
  teamName: string;
  count: number;
};

export type RecentProduct = {
  id: number;
  name: string;
  saleStatus: SaleStatus;
  createdAt: string;
  thumbnailR2Key: string | null;
};

export type ConditionDistribution = {
  condition: ProductCondition | "unspecified";
  count: number;
};

/** 비즈니스 현황 — 매출·주문·경매·회원·리뷰·포인트 스냅샷. */
export type BusinessSnapshot = {
  /** 오늘(KST) 매출 — paid 이상 상태 주문의 totalAmount 합. */
  todaySalesKrw: number;
  /** 최근 7일 매출. */
  weekSalesKrw: number;
  /** 누적 매출. */
  totalSalesKrw: number;
  /** 오늘(KST) 주문 수 (결제 완료 이상). */
  todayOrderCount: number;
  /** 발송 대기(paid) 주문 수 — 바로 처리해야 할 일. */
  awaitingShipmentCount: number;
  /** 진행중 경매 수. */
  liveAuctionCount: number;
  /** 24시간 내 마감 경매 수. */
  endingSoonAuctionCount: number;
  /** 낙찰 후 결제 대기 수. */
  awardedUnpaidCount: number;
  /** 총 회원 수(탈퇴 제외). */
  memberCount: number;
  /** 최근 7일 신규 가입. */
  newMemberCount: number;
  /** 총 리뷰 수. */
  reviewCount: number;
  /** 평균 별점(리뷰 없으면 null). */
  reviewAverage: number | null;
  /** 유통 중 포인트 잔액 합 — 미래에 쓰일 수 있는 부채. */
  outstandingPointsKrw: number;
};

export type DashboardData = {
  business: BusinessSnapshot;
  stats: DashboardStats;
  alerts: DashboardAlert[];
  teamDistribution: TeamDistribution[];
  recentProducts: RecentProduct[];
  conditionDistribution: ConditionDistribution[];
};
