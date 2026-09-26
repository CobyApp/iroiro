import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listMyOffers } from "@/modules/used/lib/buy-queries";
import { EmptyState } from "@/components/EmptyState";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { formatKstRelative } from "@/lib/datetime";
import {
  BUY_OFFER_STATUS_LABEL,
  BUY_REQUEST_STATUS_LABEL,
} from "@/modules/used/buy-types";

export const metadata: Metadata = { title: "보낸 오퍼" };

// 내가 삽니다 요청에 보낸 오퍼 목록 — 상태·연결 요청 확인.
export default async function MyBuyOffersPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login-required?from=/used/wanted/offers");

  const offers = await listMyOffers(account.id);

  return (
    <div className="shop-page-frame space-y-5">
      <ShopPageHeader title="보낸 오퍼" description="삽니다 요청에 보낸 팔게요 제안이에요." />

      {offers.length === 0 ? (
        <EmptyState
          emoji="✉️"
          title="보낸 오퍼가 없어요"
          description="삽니다 요청에 팔게요 오퍼를 보내보세요."
          action={{ href: "/used/wanted", label: "삽니다 둘러보기" }}
        />
      ) : (
        <ul className="space-y-2">
          {offers.map((offer) => (
            <li key={offer.id}>
              <Link
                href={`/used/wanted/${offer.requestId}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{offer.requestTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    요청 {BUY_REQUEST_STATUS_LABEL[offer.requestStatus]} · {formatKstRelative(offer.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-foreground">₩{offer.price.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{BUY_OFFER_STATUS_LABEL[offer.status]}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
