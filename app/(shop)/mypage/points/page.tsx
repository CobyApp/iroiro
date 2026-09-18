import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Coins, Ticket } from "lucide-react";
import { PageBack } from "@/components/PageBack";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import {
  getPointBalance,
  listCoupons,
  listPointTransactions,
} from "@/modules/points/lib/queries";
import { getReferralStats } from "@/modules/referral/lib/queries";
import { InviteCard } from "@/modules/referral/components/InviteCard";
import {
  isCouponUsable,
  POINT_REASON_LABEL,
  type PointReason,
} from "@/modules/points/lib/rules";
import { formatKstDateTime } from "@/lib/datetime";

export const metadata: Metadata = { title: "포인트 · 쿠폰" };

function formatPoints(amount: number): string {
  return `${Math.abs(amount).toLocaleString()}P`;
}

function reasonLabel(reason: string): string {
  return POINT_REASON_LABEL[reason as PointReason] ?? reason;
}

export default async function PointsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("profile"));

  const [balance, transactions, coupons, referral] = await Promise.all([
    getPointBalance(account.id),
    listPointTransactions(account.id),
    listCoupons(account.id),
    getReferralStats(account.id),
  ]);
  const now = new Date();

  return (
    <div className="shop-page-frame space-y-6">
      <div className="flex items-center gap-2">
        <PageBack fallbackHref="/mypage" />
        <h1 className="text-2xl font-bold">포인트 · 쿠폰</h1>
      </div>

      {/* 잔액 */}
      <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-5 py-4">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Coins className="h-4 w-4 text-primary" aria-hidden />
          보유 포인트
        </span>
        <b className="text-2xl text-foreground">{balance.toLocaleString()}P</b>
      </div>

      {/* 친구 초대 — 링크 공유로 양쪽 포인트 */}
      {referral && (
        <InviteCard
          code={referral.code}
          invitedCount={referral.invitedCount}
          earnedPoints={referral.earnedPoints}
        />
      )}

      {/* 쿠폰 */}
      <section className="space-y-2" aria-label="보유 쿠폰">
        <h2 className="text-sm font-semibold text-foreground">보유 쿠폰</h2>
        {coupons.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            보유한 쿠폰이 없어요
          </p>
        ) : (
          <ul className="space-y-2">
            {coupons.map((coupon) => {
              const usable = isCouponUsable(coupon, now);
              return (
                <li
                  key={coupon.id}
                  className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                    usable
                      ? "border-border bg-card"
                      : "border-border bg-muted/40 opacity-60"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Ticket className="h-4 w-4 text-primary" aria-hidden />
                    무료배송 쿠폰
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {coupon.usedAt
                      ? "사용 완료"
                      : usable
                        ? "결제 시 선택"
                        : "기한 만료"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 포인트 내역 */}
      <section className="space-y-2" aria-label="포인트 내역">
        <h2 className="text-sm font-semibold text-foreground">포인트 내역</h2>
        {transactions.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            아직 내역이 없어요
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {transactions.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span>
                  <span className="block text-foreground">
                    {reasonLabel(row.reason)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatKstDateTime(row.createdAt)}
                  </span>
                </span>
                <b
                  className={
                    row.amount > 0 ? "text-primary" : "text-foreground"
                  }
                >
                  {row.amount > 0 ? "+" : "-"}
                  {formatPoints(row.amount)}
                </b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
