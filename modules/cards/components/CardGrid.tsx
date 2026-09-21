"use client";

import { useMemo, useState } from "react";
import { ImageOff, Info, Pencil, Sparkles, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cardImageSrc, type Card as CardRow, type CardImageView } from "../types";
import type { MemberOption, SeriesOption, TeamOption } from "./CardForm";
import { CardDetailDialog } from "./CardDetailDialog";
import { CardEditDialog } from "./CardTable";
import { CardLightbox, type CardSlide } from "./CardLightbox";
import { CardSimilarPanel } from "./CardSimilarPanel";

// 공개 카드 그리드 — 카탈로그 「토레카」 탭. 디자인 시스템의 상품 카드 패턴(Storybook › Patterns › ProductSummary)을
// 63:88 카드에 맞춰 쓴다. 이미지를 누르면 풀스크린 확대(휠·핀치 줌), 하단 액션으로 상세(AI 분석값)·유사·수정.
export function CardGrid({
  items,
  teams,
  members,
  series,
  imageView,
}: {
  items: CardRow[];
  teams: TeamOption[];
  members: MemberOption[];
  series: SeriesOption[];
  imageView: CardImageView;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [detail, setDetail] = useState<CardRow | null>(null);
  const [editing, setEditing] = useState<CardRow | null>(null);
  const [similarFor, setSimilarFor] = useState<CardRow | null>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s.label])), [series]);

  const nameOf = (card: CardRow) => ({
    team: card.teamId !== null ? teamById.get(card.teamId) : undefined,
    member: card.memberId !== null ? memberById.get(card.memberId) : undefined,
    series: card.seriesId !== null ? seriesById.get(card.seriesId) : undefined,
  });

  // 뷰어 슬라이드는 이미지가 있는 카드만 — 인덱스 매핑을 따로 둔다.
  const withImage = items.filter((c) => c.frontR2Key);
  const slides: CardSlide[] = withImage.map((c) => {
    const n = nameOf(c);
    return {
      src: cardImageSrc(c, imageView) as string,
      title: `#${c.id} ${c.name}`,
      description: [n.member, n.series, `포즈 ${c.pose}`].filter(Boolean).join(" · "),
    };
  });
  const slideIndexById = new Map(withImage.map((c, i) => [c.id, i]));

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((card) => {
          const url = cardImageSrc(card, imageView);
          const slide = slideIndexById.get(card.id);
          const n = nameOf(card);
          return (
            <li key={card.id}>
              <Card className="group flex h-full flex-col overflow-hidden transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-elevated">
                <button
                  type="button"
                  disabled={slide === undefined}
                  onClick={() => slide !== undefined && setLightbox(slide)}
                  aria-label={`${card.name} 확대 보기`}
                  className="relative aspect-[63/88] w-full overflow-hidden bg-lilac text-left disabled:cursor-default"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 카탈로그 이미지
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
                  {/* AI 분석 여부 — 좌상단 배지 */}
                  <Badge
                    variant={card.analyzedAt ? "default" : "outline"}
                    className="absolute left-2 top-2 gap-1 px-2 py-0.5 text-[10px]"
                    title={card.analyzedAt ? `AI 분석 완료 · ${card.analysisModel ?? ""}` : "AI 미분석"}
                  >
                    <Sparkles className="h-2.5 w-2.5" aria-hidden />
                    {card.analyzedAt ? "AI" : "미분석"}
                  </Badge>
                  <span className="catalog-mono absolute right-2 top-2 rounded-full bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                    #{card.id}
                  </span>
                  {slide !== undefined && (
                    <span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-card/90 text-primary opacity-0 shadow-card transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </button>
                <CardContent className="flex flex-1 flex-col gap-1 p-3">
                  <p className="truncate text-xs text-muted-foreground">
                    {n.team ?? "-"}
                    {n.member && ` / ${n.member}`}
                  </p>
                  <p className="truncate text-sm font-semibold leading-tight" title={card.name}>
                    {n.series ?? card.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    포즈 {card.pose}
                    {card.itemCode && (
                      <>
                        {" · "}
                        <span className="catalog-mono">{card.itemCode}</span>
                      </>
                    )}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-1.5 text-[11px] text-primary"
                      onClick={() => setDetail(card)}
                    >
                      <Info className="h-3.5 w-3.5" />
                      상세·AI
                    </Button>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={`${card.name} 유사 카드`}
                        disabled={!card.frontR2Key}
                        title="지금 앞면을 다시 분석해 유사·중복 카드 확인"
                        onClick={() => setSimilarFor(card)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
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
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {lightbox !== null && (
        <CardLightbox slides={slides} index={lightbox} onClose={() => setLightbox(null)} />
      )}

      {detail && (
        <CardDetailDialog
          card={detail}
          teamName={nameOf(detail).team}
          memberName={nameOf(detail).member}
          seriesLabel={nameOf(detail).series}
          imageView={imageView}
          onClose={() => setDetail(null)}
        />
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
              imageView={imageView}
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
