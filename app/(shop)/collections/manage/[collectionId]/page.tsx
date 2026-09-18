import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import {
  getInventory,
  getOwnerCollections,
} from "@/modules/collection/lib/queries";
import { CollectionSettings } from "@/modules/collection/components/CollectionSettings";
import { InventoryPicker } from "@/modules/collection/components/InventoryPicker";
import { PublicLinkChip } from "@/modules/collection/components/PublicLinkChip";
import { RegisteredCards } from "@/modules/collection/components/RegisteredCards";
import { collectionThumbnailUrl } from "@/modules/products/lib/customer-media";

export const metadata: Metadata = { title: "컬렉션 관리" };

type Params = { collectionId: string };

// 컬렉션 관리 — 설정(이름·공개·삭제) + 등록 카드 재배치/해제 + 보유 카드 등록(인벤토리 피커).
export default async function ManageCollectionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("collection"));

  const { collectionId } = await params;
  const id = Number(collectionId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const collections = await getOwnerCollections(account.id);
  const collection = collections.find((c) => c.id === id);
  if (!collection) notFound();

  const inventory = await getInventory(account.id);

  return (
    <div className="shop-page-frame space-y-8">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{collection.title}</h1>
            <Badge variant={collection.isPublic ? "default" : "secondary"}>
              {collection.isPublic ? "공개" : "비공개"}
            </Badge>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/collections">목록으로</Link>
          </Button>
        </div>
        {collection.isPublic && (
          <div className="flex flex-wrap items-center gap-2">
            <PublicLinkChip publicCode={collection.publicCode} />
            <Link
              href={`/collections/${collection.publicCode}`}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              공개 페이지 열기
            </Link>
          </div>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">설정</h2>
        <CollectionSettings
          collectionId={collection.id}
          title={collection.title}
          isPublic={collection.isPublic}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          등록된 카드 ({collection.cards.length})
        </h2>
        <RegisteredCards
          collectionId={collection.id}
          cards={collection.cards.map(({ productThumbnailKey, ...card }) => ({
            ...card,
            productThumbnailUrl: productThumbnailKey
              ? collectionThumbnailUrl(card.productId)
              : null,
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">보유 카드</h2>
        <InventoryPicker
          collectionId={collection.id}
          entries={inventory.map(({ productThumbnailKey, ...entry }) => ({
            ...entry,
            productThumbnailUrl: productThumbnailKey
              ? collectionThumbnailUrl(entry.productId)
              : null,
          }))}
          registeredProductIds={collection.cards.map((c) => c.productId)}
        />
      </section>
    </div>
  );
}
