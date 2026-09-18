import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCollection } from "@/modules/collection/lib/queries";
import { CollectionGrid } from "@/modules/collection/components/CollectionGrid";
import type { CollectionCard } from "@/modules/collection/types";
import { listMembers } from "@/modules/members/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { productGridThumbnailUrl } from "@/modules/products/lib/customer-media";

type Params = { publicCode: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { publicCode } = await params;
  const collection = await getPublicCollection(publicCode);
  return { title: collection?.title ?? "컬렉션" };
}

// 카드들을 멤버(이름) → 팀(이름) → 기타 순의 섹션으로 묶는다. 섹션·카드 순서는 등록 순번 유지.
function buildSections(
  cards: CollectionCard[],
  teamNameById: Map<number, string>,
  memberNameById: Map<number, string>,
): Array<{ key: string; label: string | null; cards: CollectionCard[] }> {
  const sections = new Map<
    string,
    { key: string; label: string | null; cards: CollectionCard[] }
  >();
  for (const card of cards) {
    let key = "etc";
    let label: string | null = null;
    if (card.memberId !== null && memberNameById.has(card.memberId)) {
      key = `m:${card.memberId}`;
      label = memberNameById.get(card.memberId) ?? null;
    } else if (card.teamId !== null && teamNameById.has(card.teamId)) {
      key = `t:${card.teamId}`;
      label = teamNameById.get(card.teamId) ?? null;
    }
    const section = sections.get(key) ?? { key, label, cards: [] };
    section.cards.push(card);
    sections.set(key, section);
  }
  return [...sections.values()];
}

// 공개 컬렉션 페이지 — 비로그인 열람 가능. 비공개·미존재 코드는 동일하게 404.
export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { publicCode } = await params;
  const collection = await getPublicCollection(publicCode);
  if (!collection) notFound();

  const [teams, members] =
    collection.cards.length > 0
      ? await Promise.all([listTeams(), listMembers()])
      : [[], []];
  const sections = buildSections(
    collection.cards,
    new Map(teams.map((t) => [t.id, t.name])),
    new Map(members.map((m) => [m.id, m.name])),
  );

  return (
    <div className="shop-page-frame space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{collection.title}</h1>
        <p className="text-sm text-muted-foreground">
          카드 {collection.cards.length}장
        </p>
      </header>
      {collection.cards.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">아직 등록된 카드가 없습니다</p>
        </div>
      ) : (
        <CollectionGrid
          sections={sections.map((section) => ({
            ...section,
            cards: section.cards.map(({ productThumbnailKey, ...card }) => ({
              ...card,
              productThumbnailUrl: productThumbnailKey
                ? productGridThumbnailUrl(card.productId)
                : null,
            })),
          }))}
        />
      )}
    </div>
  );
}
