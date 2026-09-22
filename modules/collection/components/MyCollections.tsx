"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OwnerCollection } from "../types";
import { CardTile, type CustomerCollectionCard } from "./CollectionGrid";
import { CreateCollectionForm } from "./CreateCollectionForm";
import { PublicLinkChip } from "./PublicLinkChip";

type Props = {
  collections: Array<Omit<OwnerCollection, "cards"> & { cards: CustomerCollectionCard[] }>;
};

// 탭형 마이페이지 뷰(레퍼런스 /profile 반영) — 컬렉션 탭 전환 + 선택 컬렉션 그리드 +
// [+] 타일(관리 페이지의 등록 피커로 이동). 컬렉션이 없으면 생성 폼을 바로 노출.
export function MyCollections({ collections }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(
    collections[0]?.id ?? null,
  );
  const [creating, setCreating] = useState(collections.length === 0);
  const selected =
    collections.find((c) => c.id === selectedId) ?? collections[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {collections.map((collection) => {
          const isSelected = !creating && collection.id === selected?.id;
          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => {
                setSelectedId(collection.id);
                setCreating(false);
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {collection.title}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="새 컬렉션"
          onClick={() => setCreating((v) => !v)}
          className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
            creating
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {creating ? (
        <div className="space-y-2">
          {collections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              첫 컬렉션을 만들어 구매한 카드를 자랑해보세요.
            </p>
          )}
          <CreateCollectionForm onCreated={() => setCreating(false)} />
        </div>
      ) : selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={selected.isPublic ? "default" : "secondary"}>
                {selected.isPublic ? "공개" : "비공개"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                카드 {selected.cards.length}종
              </span>
              {selected.isPublic && (
                <PublicLinkChip publicCode={selected.publicCode} />
              )}
            </div>
            <div className="flex gap-2">
              {selected.isPublic && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/collections/${selected.publicCode}`}>
                    공개 페이지
                  </Link>
                </Button>
              )}
              <Button asChild size="sm">
                <Link href={`/collections/manage/${selected.id}`}>관리</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
            {selected.cards.map((card) => (
              <CardTile key={card.id} card={card} />
            ))}
            <Link
              href={`/collections/manage/${selected.id}`}
              aria-label="카드 등록"
              className="flex aspect-[3/4] items-center justify-center rounded-sm border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-8 w-8" aria-hidden />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
