"use client";

import { useState } from "react";
import { ImageOff, ZoomIn } from "lucide-react";
import { CardViewer3D, type Viewer3DCard } from "@/components/CardViewer3D";
import type { CollectionCard } from "../types";

export type CustomerCollectionCard = Omit<
  CollectionCard,
  "productThumbnailKey"
> & { productThumbnailUrl: string | null };

export type CollectionSection = {
  key: string;
  label: string | null;
  cards: CustomerCollectionCard[];
};

type Props = {
  sections: CollectionSection[];
};

// 공개 컬렉션 그리드 — 멤버/그룹별 섹션. 섹션이 "기타" 하나뿐이면 헤더 없이 평면 그리드.
export function CollectionGrid({ sections }: Props) {
  const [active, setActive] = useState<Viewer3DCard | null>(null);
  const showHeaders = sections.some((s) => s.label !== null);
  return (
    <>
      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.key} className="space-y-3">
            {showHeaders && (
              <h2 className="text-lg font-semibold">
                {section.label ?? "기타"}
              </h2>
            )}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {section.cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  onOpen={() =>
                    setActive({
                      front: card.productThumbnailUrl,
                      title: card.productName,
                    })
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <CardViewer3D card={active} onClose={() => setActive(null)} />
    </>
  );
}

// 카드 타일 — 공개 그리드와 소유자 마이페이지가 공유(순수 표현 컴포넌트).
export function CardTile({
  card,
  onOpen,
}: {
  card: CustomerCollectionCard;
  onOpen?: () => void;
}) {
  const content = (
    <figure className="space-y-1.5">
      <div className="group relative aspect-[3/4] overflow-hidden rounded-sm bg-muted shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-elevated">
        {card.productThumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.productThumbnailUrl}
            alt={card.productName}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden />
          </div>
        )}
        {card.quantity > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
            ×{card.quantity}
          </span>
        )}
        {onOpen && (
          <span className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <figcaption className="truncate text-xs text-muted-foreground">
        {card.productName}
      </figcaption>
    </figure>
  );

  if (!onOpen) return content;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left"
      aria-label={`${card.productName} 확대 보기`}
    >
      {content}
    </button>
  );
}
