import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  getBuyRequestById,
  getMyOfferForRequest,
  listMyActiveListingsForOffer,
  listOffersForRequest,
} from "@/modules/used/lib/buy-queries";
import { BuyOfferList } from "@/modules/used/components/BuyOfferList";
import { BuyRequestOfferForm } from "@/modules/used/components/BuyRequestOfferForm";
import { BuyRequestOwnerControls } from "@/modules/used/components/BuyRequestOwnerControls";
import {
  BUY_OFFER_STATUS_LABEL,
  BUY_REQUEST_STATUS_LABEL,
} from "@/modules/used/buy-types";
import { USED_ITEM_TYPE_LABEL, type UsedItemType } from "@/modules/used/types";
import { PRODUCT_CONDITION_LABEL } from "@/modules/products/types";
import { ProductImage } from "@/modules/products/components/ProductImage";
import { env } from "@/lib/env";
import { formatKstRelative } from "@/lib/datetime";

export const metadata: Metadata = { title: "삽니다" };

export default async function BuyRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) notFound();

  const request = await getBuyRequestById(requestId);
  if (!request || request.status === "blocked") notFound();

  const account = await getCurrentAccount();
  const isOwner = account?.id === request.requesterAccountId;
  const isOpen = request.status === "open";

  // 요청자에게만 전체 오퍼 목록 노출(경쟁 가격 보호). 비요청자는 자기 오퍼만.
  const [offers, myOffer, myListings] = await Promise.all([
    isOwner ? listOffersForRequest(requestId) : Promise.resolve([]),
    account && !isOwner
      ? getMyOfferForRequest(requestId, account.id)
      : Promise.resolve(null),
    account && !isOwner && isOpen
      ? listMyActiveListingsForOffer(account.id)
      : Promise.resolve([]),
  ]);

  const itemLabel =
    USED_ITEM_TYPE_LABEL[request.itemType as UsedItemType] ?? request.itemType;
  const tags = [request.teamName, request.memberName].filter(Boolean) as string[];

  return (
    <div className="shop-page-frame space-y-6">
      <article className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
            삽니다
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
            {itemLabel}
          </span>
          {!isOpen && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {BUY_REQUEST_STATUS_LABEL[request.status]}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold text-foreground">{request.title}</h1>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">희망 예산</dt>
            <dd className="mt-0.5 font-display text-base text-foreground">
              {request.budget != null ? `₩${request.budget.toLocaleString()}` : "협의"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">수량</dt>
            <dd className="mt-0.5 text-foreground">{request.quantity}개</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">최소 상태</dt>
            <dd className="mt-0.5 text-foreground">
              {request.minCondition ? PRODUCT_CONDITION_LABEL[request.minCondition] : "상관없음"}
            </dd>
          </div>
        </dl>

        {request.imageKeys.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {request.imageKeys.map((key) => (
              <div key={key} className="overflow-hidden rounded-lg border border-border bg-muted">
                <ProductImage
                  src={`${env.R2_PUBLIC_BASE}/${key}`}
                  alt="참고 이미지"
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {request.description && (
          <p className="whitespace-pre-wrap text-sm text-foreground">{request.description}</p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            {request.requesterName} · {formatKstRelative(request.createdAt)}
          </span>
          {isOwner && (request.status === "open" || request.status === "fulfilled") && (
            <BuyRequestOwnerControls requestId={request.id} />
          )}
        </div>
      </article>

      {/* 요청자: 받은 오퍼 관리 */}
      {isOwner && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">
            받은 오퍼 {offers.length > 0 && `(${offers.length})`}
          </h2>
          <BuyOfferList
            offers={offers}
            isOwner
            isOpen={isOpen}
            viewerAccountId={account?.id ?? null}
          />
        </section>
      )}

      {/* 비요청자: 오퍼 보내기 또는 내 오퍼 상태 */}
      {!isOwner && account && (
        <section className="space-y-3">
          {myOffer ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">내 오퍼</p>
              <p className="mt-1 text-muted-foreground">
                ₩{myOffer.price.toLocaleString()} · {BUY_OFFER_STATUS_LABEL[myOffer.status]}
              </p>
              {myOffer.status === "accepted" && (
                <p className="mt-1 text-primary">수락됐어요! 쪽지로 거래를 진행해요.</p>
              )}
            </div>
          ) : isOpen ? (
            <BuyRequestOfferForm requestId={request.id} myListings={myListings} />
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              {request.status === "fulfilled" ? "이미 성사된 요청이에요." : "종료된 요청이에요."}
            </p>
          )}
        </section>
      )}

      {!account && (
        <p className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          로그인하면 오퍼를 보낼 수 있어요.
        </p>
      )}
    </div>
  );
}
