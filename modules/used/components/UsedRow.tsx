import { HScroll } from "@/components/HScroll";
import { UsedListingCard } from "./UsedListingCard";
import type { UsedListingWithPhotos } from "../types";

// 중고 홈 큐레이션 섹션용 가로 스크롤 매물 행 — ProductRow와 같은 규격.
export function UsedRow({
  listings,
  publicBaseUrl,
  wishedIds,
  isLoggedIn = false,
}: {
  listings: UsedListingWithPhotos[];
  publicBaseUrl: string;
  wishedIds?: Set<number>;
  isLoggedIn?: boolean;
}) {
  if (listings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">매물이 곧 채워질 거예요.</p>
    );
  }
  return (
    <HScroll className="scroll-x scroll-x-bleed mt-3 flex gap-3 overflow-x-auto pb-3 pt-3">
      {listings.map((listing) => (
        <div key={listing.id} className="w-40 shrink-0 sm:w-48">
          <UsedListingCard
            listing={listing}
            publicBaseUrl={publicBaseUrl}
            wished={wishedIds?.has(listing.id) ?? false}
            isLoggedIn={isLoggedIn}
          />
        </div>
      ))}
    </HScroll>
  );
}
