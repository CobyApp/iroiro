import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { remainingLabel } from "@/modules/auction/lib/rules";
import type { SiblingListing } from "../lib/queries";
import {
} from "../types";

// 같은 카드의 다른 매물 — 컨디션·판매방식이 다른 매물을 별개로 나열한다.
// 구매자는 상태·가격·방식을 비교해 원하는 매물로 바로 이동할 수 있다.
export function SiblingListings({ listings }: { listings: SiblingListing[] }) {
  if (listings.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">
        이 카드의 다른 매물 <span className="text-muted-foreground">{listings.length}</span>
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
        {listings.map((l) => {
          const isAuction = l.saleMode === "auction";
          const live = isAuction && l.auctionStatus === "live";
          const soldOut = !isAuction && l.stockQuantity === 0;
          const price = isAuction
            ? (l.auctionCurrentPrice ?? l.auctionStartPrice ?? l.salePrice)
            : l.salePrice;
          const ends =
            live && l.auctionEndsAt
              ? remainingLabel(l.auctionEndsAt, new Date())
              : null;
          return (
            <li key={l.id}>
              <Link
                href={`/products/${l.id}`}
                className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
              >
                {/* 스토어 매물은 컨디션 미노출 — 판매방식·가격으로 구분. */}
                {isAuction ? (
                  <Badge className="shrink-0">
                    {live ? "입찰" : l.auctionStatus === "awarded" ? "낙찰" : "유찰"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    바로구매
                  </Badge>
                )}
                <span className="min-w-0 flex-1" />
                {live && ends && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {ends === "마감" ? "마감" : `${ends} 남음`}
                  </span>
                )}
                {soldOut ? (
                  <span className="shrink-0 text-xs text-muted-foreground">품절</span>
                ) : (
                  <span className="shrink-0 font-semibold text-primary">
                    ₩{price.toLocaleString()}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
