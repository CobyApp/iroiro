import "server-only";

import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";

// 관리자 대시보드 "처리 대기" — 각 관리 공간에서 사람이 손봐야 하는 큐의 건수를 한곳에 모은다.
// site admin 홈에서 어디에 일이 밀렸는지 한눈에 보고 바로 이동하기 위한 운영 트리아지.

export type PendingWorkItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  /** 소속 관리 공간 — 대시보드에서 색/구분 표시용. */
  scope: "delivery" | "market" | "board" | "catalog";
};

export async function getPendingWork(): Promise<PendingWorkItem[]> {
  const [
    awaitingShipment,
    usedReports,
    usedReviewReports,
    usedDisputes,
    postReports,
    pendingCards,
  ] = await Promise.all([
    db.order.count({ where: { status: "paid" } }),
    db.usedReport.count({ where: { resolvedAt: null } }),
    db.usedReviewReport.count({ where: { resolvedAt: null } }),
    db.usedTrade.count({ where: { status: "disputed" } }),
    db.postReport.count({ where: { resolvedAt: null } }),
    catalogDb.card.count({ where: { status: "pending" } }),
  ]);

  return [
    {
      key: "awaiting-shipment",
      label: "발송 대기 주문",
      count: awaitingShipment,
      href: "/admin/store/orders?status=paid",
      scope: "delivery",
    },
    {
      key: "used-disputes",
      label: "거래 분쟁",
      count: usedDisputes,
      href: "/admin/used/disputes",
      scope: "market",
    },
    {
      key: "used-reports",
      label: "매물 신고",
      count: usedReports,
      href: "/admin/used/reports",
      scope: "market",
    },
    {
      key: "used-review-reports",
      label: "후기 신고",
      count: usedReviewReports,
      href: "/admin/used/review-reports",
      scope: "market",
    },
    {
      key: "post-reports",
      label: "게시글 신고",
      count: postReports,
      href: "/admin/posts/posts",
      scope: "board",
    },
    {
      key: "pending-cards",
      label: "토레카 검수 대기",
      count: pendingCards,
      href: "/admin/catalog/cards",
      scope: "catalog",
    },
  ];
}
