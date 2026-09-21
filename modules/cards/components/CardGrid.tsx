"use client";

import { useMemo, useState } from "react";
import { ImageOff, Pencil, Sparkles, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { cardFrontUrl, type Card } from "../types";
import type { MemberOption, SeriesOption, TeamOption } from "./CardForm";
import { CardEditDialog } from "./CardTable";
import { CardLightbox, type CardSlide } from "./CardLightbox";
import { CardSimilarPanel } from "./CardSimilarPanel";

// 공개 카드 그리드 — 카탈로그 「토레카」 탭. 63:88 타일을 도감처럼 훑고, 클릭하면 풀스크린
// 확대 뷰어(휠·핀치 줌, ←/→ 이동). 타일 하단 액션으로 수정·AI 유사 카드 확인.
export function CardGrid({
  items,
  teams,
  members,
  series,
  publicBaseUrl,
}: {
  items: Card[];
  teams: TeamOption[];
  members: MemberOption[];
  series: SeriesOption[];
  publicBaseUrl: string;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [similarFor, setSimilarFor] = useState<Card | null>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s.label])), [series]);

  function subtitle(card: Card): string {
    const parts = [
      card.memberId !== null ? memberById.get(card.memberId) : undefined,
      card.seriesId !== null ? seriesById.get(card.seriesId) : undefined,
    ].filter(Boolean);
    return [...parts, `포즈 ${card.pose}`].join(" · ");
  }

  // 뷰어 슬라이드는 이미지가 있는 카드만 — 인덱스 매핑을 따로 둔다.
  const withImage = items.filter((c) => c.frontR2Key);
  const slides: CardSlide[] = withImage.map((c) => ({
    src: cardFrontUrl(c, publicBaseUrl) as string,
    title: `#${c.id} ${c.name}`,
    description: subtitle(c),
  }));
  const slideIndexById = new Map(withImage.map((c, i) => [c.id, i]));

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((card) => {
          const url = cardFrontUrl(card, publicBaseUrl);
          const slide = slideIndexById.get(card.id);
          return (
            <li
              key={card.id}
              className="group flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <button
                type="button"
                disabled={slide === undefined}
                onClick={() => slide !== undefined && setLightbox(slide)}
                aria-label={`${card.name} 확대 보기`}
                className="relative aspect-[63/88] w-full overflow-hidden bg-muted text-left disabled:cursor-default"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- R2 이미지
                  <img
                    src={url}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground">
                    <ImageOff className="h-6 w-6" aria-hidden />
                  </div>
                )}
                {/* AI 분석 여부 — 좌상단 점. 미분석은 회색 */}
                <span
                  className={cn(
                    "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    card.analyzedAt
                      ? "bg-accent/90 text-accent-foreground"
                      : "bg-black/45 text-white/90",
                  )}
                  title={card.analyzedAt ? `AI 분석 완료 · ${card.analysisModel ?? ""}` : "AI 미분석"}
                >
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  {card.analyzedAt ? "AI" : "미분석"}
                </span>
                <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/55 px-1.5 py-0.5 catalog-mono text-[10px] text-white">
                  #{card.id}
                </span>
                {slide !== undefined && (
                  <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <p className="truncate text-[13px] font-semibold leading-tight text-foreground" title={card.name}>
                  {card.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {card.teamId !== null ? teamById.get(card.teamId) : "-"} · {subtitle(card)}
                </p>
                {card.itemCode && (
                  <p className="catalog-mono truncate text-muted-foreground">{card.itemCode}</p>
                )}
                <div className="mt-auto flex items-center justify-end gap-0.5 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[11px]"
                    disabled={!card.frontR2Key}
                    title="AI로 유사·중복 카드 확인"
                    onClick={() => setSimilarFor(card)}
                  >
                    <Sparkles className="h-3 w-3" />
                    유사
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    aria-label={`${card.name} 수정`}
                    onClick={() => setEditing(card)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {lightbox !== null && (
        <CardLightbox slides={slides} index={lightbox} onClose={() => setLightbox(null)} />
      )}

      {similarFor && similarFor.frontR2Key && (
        <Dialog open onOpenChange={(open) => !open && setSimilarFor(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                유사 카드 — #{similarFor.id} {similarFor.name}
              </DialogTitle>
            </DialogHeader>
            <CardSimilarPanel
              frontR2Key={similarFor.frontR2Key}
              teamId={similarFor.teamId}
              memberId={similarFor.memberId}
              publicBaseUrl={publicBaseUrl}
            />
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <CardEditDialog
          card={editing}
          teams={teams}
          members={members}
          series={series}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
