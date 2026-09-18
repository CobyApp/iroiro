import type { Metadata } from "next";
import { Images } from "lucide-react";
import { getCurrentAccount } from "@/modules/auth/dal";
import {
  getInventory,
  getOwnerCollections,
} from "@/modules/collection/lib/queries";
import { getProductsByIds } from "@/modules/products/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { MyCollections } from "@/modules/collection/components/MyCollections";
import { OwnedCardsExplorer } from "@/modules/collection/components/OwnedCardsExplorer";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import {
  collectionPhotoUrl,
  collectionThumbnailUrl,
} from "@/modules/products/lib/customer-media";

export const metadata: Metadata = { title: "컬렉션" };

// 컬렉션 허브 — 큐레이션 컬렉션(탭 전환·생성·공개 공유) + 전체 보유 카드 탐색.
// 비로그인은 기능 안내 게이트.
export default async function CollectionsPage() {
  const account = await getCurrentAccount().catch(() => null);
  if (!account) {
    return (
      <div className="shop-page-frame space-y-6">
        <ShopPageHeader title="내 컬렉션" />
        <GuestFeatureGate
          icon={Images}
          title="나만의 포토카드 컬렉션을 만들어보세요"
          description="구매한 카드를 그룹·멤버별로 정리하고, 공개 링크로 친구에게 공유할 수 있어요. 로그인하면 소장 카드가 자동으로 연결됩니다."
          benefits={[
            "소장 카드 그룹·멤버별 정리",
            "공개 링크로 컬렉션 공유",
            "컬렉션별로 카드 나눠 정리",
          ]}
          secondaryHref="/products"
          secondaryLabel="상품 둘러보기"
        />
      </div>
    );
  }

  const [owner, inventory, teams, members] = await Promise.all([
    getOwnerCollections(account.id),
    getInventory(account.id),
    listTeams(),
    listMembers(),
  ]);

  const collections = owner.map((collection) => ({
    ...collection,
    cards: collection.cards.map(({ productThumbnailKey, ...card }) => ({
      ...card,
      productThumbnailUrl: productThumbnailKey
        ? collectionThumbnailUrl(card.productId)
        : null,
    })),
  }));

  const teamNames = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));

  // 보유 카드 앞/뒤 이미지 — 3D 뷰어 뒤집기용.
  const products = inventory.length
    ? await getProductsByIds(inventory.map((e) => Number(e.productId)))
    : [];
  const imagesByProduct: Record<
    number,
    { front: string | null; back: string | null }
  > = {};
  for (const p of products) {
    const thumb = p.photos.find((ph) => ph.isThumbnail) ?? p.photos[0];
    const back = p.photos.find((ph) => ph !== thumb) ?? null;
    imagesByProduct[Number(p.id)] = {
      front: thumb ? collectionPhotoUrl(thumb.id) : null,
      back: back ? collectionPhotoUrl(back.id) : null,
    };
  }

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader title="내 컬렉션" />

      <section className="shop-content-surface space-y-5">
        <h2 className="shop-section-title">컬렉션 보관함</h2>
        <MyCollections collections={collections} />
      </section>

      <section className="shop-content-surface space-y-5">
        <h2 className="shop-section-title">전체 보유 카드</h2>
        <OwnedCardsExplorer
          entries={inventory.map(({ productThumbnailKey, ...entry }) => ({
            ...entry,
            productThumbnailUrl: productThumbnailKey
              ? collectionThumbnailUrl(entry.productId)
              : null,
          }))}
          teamNames={teamNames}
          memberNames={memberNames}
          imagesByProduct={imagesByProduct}
        />
      </section>
    </div>
  );
}
