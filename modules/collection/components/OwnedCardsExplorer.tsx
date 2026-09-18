"use client";

import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardViewer3D, type Viewer3DCard } from "@/components/CardViewer3D";
import { groupOwnedCards } from "../lib/group-inventory";
import type { InventoryEntry } from "../types";

export type CustomerInventoryEntry = Omit<
  InventoryEntry,
  "productThumbnailKey"
> & { productThumbnailUrl: string | null };

type View = "all" | "team" | "member";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "team", label: "그룹별" },
  { key: "member", label: "그룹·멤버별" },
];

export function OwnedCardsExplorer({
  entries,
  teamNames,
  memberNames,
  imagesByProduct,
}: {
  entries: CustomerInventoryEntry[];
  teamNames: Record<number, string>;
  memberNames: Record<number, string>;
  imagesByProduct: Record<
    number,
    { front: string | null; back: string | null }
  >;
}) {
  const [view, setView] = useState<View>("all");
  const [active, setActive] = useState<Viewer3DCard | null>(null);
  const groups = useMemo(
    () => groupOwnedCards(entries, teamNames, memberNames),
    [entries, teamNames, memberNames],
  );

  function open(e: CustomerInventoryEntry) {
    const imgs = imagesByProduct[e.productId];
    const fallback = e.productThumbnailUrl;
    setActive({
      front: imgs?.front ?? fallback,
      back: imgs?.back ?? null,
      title: e.productName,
    });
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-12 text-center shadow-card">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Heart className="h-6 w-6" aria-hidden />
        </span>
        <p className="font-display text-foreground">
          아직 구매한 카드가 없어요
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          상품을 구매하면 여기에 모여요
        </p>
        <Button asChild size="sm" className="mt-5">
          <Link href="/products">상품 둘러보기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={cn(
              "rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[.98]",
              view === v.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "all" && <Grid entries={entries} onOpen={open} />}

      {view === "team" &&
        groups.map((t) => (
          <section key={t.teamId ?? "none"} className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              {t.teamName}{" "}
              <span className="text-sm text-muted-foreground">
                {t.cardCount}장
              </span>
            </h2>
            <Grid entries={t.members.flatMap((m) => m.entries)} onOpen={open} />
          </section>
        ))}

      {view === "member" &&
        groups.map((t) => (
          <section key={t.teamId ?? "none"} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              {t.teamName}{" "}
              <span className="text-sm text-muted-foreground">
                {t.cardCount}장
              </span>
            </h2>
            {t.members.map((m) => (
              <div key={m.memberId ?? "none"} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {m.memberName} · {m.cardCount}장
                </h3>
                <Grid entries={m.entries} onOpen={open} />
              </div>
            ))}
          </section>
        ))}

      <CardViewer3D card={active} onClose={() => setActive(null)} />
    </div>
  );
}

function Grid({
  entries,
  onOpen,
}: {
  entries: CustomerInventoryEntry[];
  onOpen: (e: CustomerInventoryEntry) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {entries.map((e) => (
        <button
          key={e.productId}
          type="button"
          onClick={() => onOpen(e)}
          aria-label={`${e.productName} 크게 보기`}
          className="group block text-left"
        >
          <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-border bg-lilac shadow-card transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0">
            {e.productThumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 썸네일
              <img
                src={e.productThumbnailUrl}
                alt={e.productName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
            {e.quantity > 1 && (
              <span className="absolute bottom-1 right-1 rounded-full border border-border bg-card px-1.5 text-[10px] font-medium shadow-card">
                ×{e.quantity}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
