import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { formatKstDate } from "@/lib/datetime";
import { getCurrentAccount } from "@/modules/auth/dal";
import Link from "next/link";
import { ArrowUpRight, Store } from "lucide-react";
import {
  getActiveTradeForListing,
  getUsedListingById,
  listSellerListings,
} from "@/modules/used/lib/queries";
import { settleUsedListingIfDue } from "@/modules/used/actions";
import { AUTO_CONFIRM_MS } from "@/modules/used/lib/settle-trade";
import { UsedDetailCta } from "@/modules/used/components/UsedDetailCta";
import { MeetLocationMap } from "@/modules/used/components/MeetLocationMap";
import { ReportListingDialog } from "@/modules/used/components/ReportListingDialog";
import { UsedRow } from "@/modules/used/components/UsedRow";
import { getUsedWishlistIds } from "@/modules/used/lib/wishlist";
import { getPointBalance } from "@/modules/points/lib/queries";
import { UsedPhotoGallery } from "@/modules/used/components/UsedPhotoGallery";
import { UsedCommentSection } from "@/modules/used/components/UsedCommentSection";
import { listUsedComments } from "@/modules/used/lib/comments";
import { MessageUserButton } from "@/modules/messages/components/MessageUserButton";
import {
  PRODUCT_CONDITION_BADGE_CLASS,
  PRODUCT_CONDITION_LABEL,
  USED_SHIPPING_LABEL,
  USED_STATUS_LABEL,
} from "@/modules/used/types";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getUsedListingById(Number(id) || 0);
  return { title: listing ? `${listing.title} — 중고거래` : "중고 매물" };
}

export default async function UsedDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) notFound();

  // 경매는 조회 시점 lazy 정산(멱등) 후 최신 상태로.
  await settleUsedListingIfDue(listingId);
  const listing = await getUsedListingById(listingId);
  if (!listing || listing.status === "blocked") notFound();

  const [account, trade, teams, members, comments] = await Promise.all([
    getCurrentAccount(),
    getActiveTradeForListing(listingId),
    listTeams(),
    listMembers(),
    listUsedComments(listingId),
  ]);
  const [usedWishedIds, pointBalance] = account
    ? await Promise.all([
        getUsedWishlistIds(account.id),
        getPointBalance(account.id),
      ])
    : [undefined, 0];
  // 이 판매자의 다른 판매중 매물(현재 매물 제외) — 상세 하단·묶음 구매 유도.
  const sellerOther = await listSellerListings(listing.sellerAccountId, {
    excludeId: listingId,
    pageSize: 12,
  });
  const role =
    account === null
      ? ("visitor" as const)
      : listing.sellerAccountId === account.id
        ? ("seller" as const)
        : trade?.buyerAccountId === account.id
          ? ("buyer" as const)
          : ("visitor" as const);
  // 거래 정보는 당사자에게만 — 방문자에게는 상태 배지로만 보인다.
  const visibleTrade = role === "visitor" ? null : trade;

  // 발송된 거래 — 자동 구매확정 예정일 안내(배송조회는 택배사 링크로 컴포넌트가 표시).
  let autoConfirmNote: string | null = null;
  if (visibleTrade?.status === "shipped" && visibleTrade.shippedAt) {
    const dueAt = new Date(
      new Date(visibleTrade.shippedAt).getTime() + AUTO_CONFIRM_MS,
    );
    autoConfirmNote = `${formatKstDate(dueAt)}에 자동으로 구매확정돼요`;
  }

  const team = teams.find((t) => t.id === listing!.teamId);
  const member = members.find((m) => m.id === listing!.memberId);

  return (
    <div className="shop-page-frame space-y-4">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <UsedPhotoGallery
          photos={listing.photos.map((p) => ({
            id: p.id,
            url: `${env.R2_PUBLIC_BASE}/${p.r2Key}`,
          }))}
          alt={listing.title}
          unavailable={listing.status !== "active"}
          statusLabel={
            listing.status !== "active" && listing.status !== "reserved"
              ? USED_STATUS_LABEL[listing.status]
              : undefined
          }
        />
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {USED_STATUS_LABEL[listing.status]}
              </Badge>
              {(team || member) && (
                <span className="text-xs text-muted-foreground">
                  {team?.name}
                  {member ? ` / ${member.name}` : ""}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {listing.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/used/seller/${listing.sellerAccountId}`}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
              >
                <Store className="h-3.5 w-3.5" />
                {listing.sellerName}
              </Link>{" "}
              · {formatKstDate(listing.createdAt)} 등록
            </p>
            {role !== "seller" && (
              <div className="pt-1">
                <MessageUserButton
                  toAccountId={listing.sellerAccountId}
                  toName={listing.sellerName}
                  isLoggedIn={account !== null}
                  contextLabel={listing.title}
                  variant="outline"
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* 세부정보 — 스토어 상세와 같은 표 형식(컨디션·배송)으로 통일. */}
          <div className="space-y-2 border-y border-border py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">컨디션</span>
              <Badge
                variant="outline"
                className={cn(PRODUCT_CONDITION_BADGE_CLASS[listing.condition])}
              >
                {PRODUCT_CONDITION_LABEL[listing.condition]}
              </Badge>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">거래 방식</span>
              <span className="text-right text-foreground">
                {listing.parcelEnabled && (
                  <span className="block">
                    택배 · {USED_SHIPPING_LABEL[listing.shippingMethod]}
                    {listing.shippingFee > 0
                      ? ` · ₩${listing.shippingFee.toLocaleString()}`
                      : " · 배송비 포함"}
                  </span>
                )}
                {listing.directEnabled && (
                  <span className="block">
                    직거래
                    {listing.meetLocations.length > 0
                      ? ` · 만날 장소 ${listing.meetLocations.length}곳`
                      : ""}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* 직거래 만날 장소 — 지도 + 목록 */}
          {listing.directEnabled && listing.meetLocations.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">직거래 만날 장소</h2>
              <MeetLocationMap locations={listing.meetLocations} />
            </div>
          )}

          <UsedDetailCta
            listing={listing}
            trade={visibleTrade}
            role={role}
            isLoggedIn={account !== null}
            wished={usedWishedIds?.has(listing.id) ?? false}
            pointBalance={pointBalance}
            autoConfirmNote={autoConfirmNote}
          />

          {listing.description && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">설명</h2>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {listing.description}
              </p>
            </div>
          )}

          {/* 신고 — 로그인한 비판매자만. 부적절한 매물을 운영팀에 알린다. */}
          {role !== "seller" && account !== null && (
            <div className="flex justify-end border-t border-border pt-3">
              <ReportListingDialog listingId={listing.id} />
            </div>
          )}
        </div>
      </div>

      {/* 이 판매자의 다른 매물 — 함께 사면 배송비 1회(묶음 구매) 유도. */}
      {sellerOther.total > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-foreground">
                이 판매자의 다른 매물
              </h2>
              <p className="text-xs text-muted-foreground">
                함께 구매하면 배송비를 한 번만 내요.
              </p>
            </div>
            <Link
              href={`/used/seller/${listing.sellerAccountId}`}
              className="inline-flex shrink-0 items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
            >
              상점 전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <UsedRow
            listings={sellerOther.items}
            publicBaseUrl={env.R2_PUBLIC_BASE}
            wishedIds={usedWishedIds}
            isLoggedIn={account !== null}
          />
        </section>
      )}

      {/* 공개 댓글 — 모든 회원이 이 매물에 대해 대화할 수 있다(비공개 쪽지와 별개). */}
      <UsedCommentSection
        listingId={listing.id}
        comments={comments}
        isLoggedIn={account !== null}
        viewerAccountId={account?.id ?? null}
      />
    </div>
  );
}
