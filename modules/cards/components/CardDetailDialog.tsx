"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKstDateTime } from "@/lib/datetime";
import { getCardAnalysisDetail, type CardAnalysisDetail } from "../actions";
import { CARD_STATUS_LABEL, cardImageSrc, type Card, type CardImageView } from "../types";
import { EmbeddingSparkline } from "./EmbeddingSparkline";

// 카드 상세 — 카탈로그(관리)에서 한 장의 모든 것: clean 원본, 계층·코드, 저장된 AI 분석값(모델·시각·차원·노름·분포·
// 스파크라인)과 저장 임베딩 기준 유사 카드. 열릴 때 서버 액션으로 분석값을 읽는다(Bedrock 호출 없음).
export function CardDetailDialog({
  card,
  teamName,
  memberName,
  seriesLabel,
  imageView,
  onClose,
}: {
  card: Card;
  teamName?: string;
  memberName?: string;
  seriesLabel?: string;
  imageView: CardImageView;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CardAnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = cardImageSrc(card, imageView);

  useEffect(() => {
    let alive = true;
    getCardAnalysisDetail(card.id).then((res) => {
      if (!alive) return;
      if (res.ok) setDetail(res.data);
      else setError(res.message);
    });
    return () => {
      alive = false;
    };
  }, [card.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="catalog-mono text-muted-foreground">#{card.id}</span>
            {card.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,220px)_1fr]">
          <div className="space-y-2">
            <div className="aspect-[63/88] overflow-hidden rounded-sm border border-border bg-lilac shadow-card">
              {url && (
                // eslint-disable-next-line @next/next/no-img-element -- 카탈로그 clean 원본 프록시
                <img src={url} alt={card.name} className="h-full w-full object-cover" />
              )}
            </div>
            {imageView.kind === "admin" && (
              <p className="text-center text-[11px] text-muted-foreground">워터마크 없는 원본</p>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {/* 계층·상태 */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="그룹">{teamName ?? "-"}</Field>
              <Field label="멤버">{memberName ?? "-"}</Field>
              <Field label="시리즈">{seriesLabel ?? "-"}</Field>
              <Field label="포즈">{card.pose}</Field>
              <Field label="아이템 코드">
                {card.itemCode ? <span className="catalog-mono">{card.itemCode}</span> : "-"}
              </Field>
              <Field label="상태">
                <Badge variant={card.status === "active" ? "outline" : "default"}>
                  {CARD_STATUS_LABEL[card.status]}
                </Badge>
                {card.submittedByAccountId && (
                  <span className="ml-1 text-xs text-muted-foreground">유저 제보</span>
                )}
              </Field>
              <Field label="정가">{card.retailPriceJpy ? `¥${card.retailPriceJpy.toLocaleString()}` : "-"}</Field>
              <Field label="등록">{formatKstDateTime(card.createdAt)}</Field>
            </dl>

            {/* AI 분석값 */}
            <section className="rounded-md border border-border bg-muted/40 p-4">
              <h3 className="flex items-center gap-1.5 font-display text-base">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                AI 분석값
              </h3>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              {!detail && !error && (
                <p className="mt-2 text-sm text-muted-foreground">불러오는 중…</p>
              )}
              {detail && detail.dimension === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  아직 분석되지 않았어요 — 승인·저장 시점에 앞면(clean)을 임베딩해요.
                </p>
              )}
              {detail && detail.dimension > 0 && (
                <div className="mt-3 space-y-3">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                    <Field label="모델">
                      <span className="catalog-mono">{detail.model ?? "-"}</span>
                    </Field>
                    <Field label="분석 시각">
                      {detail.analyzedAt ? formatKstDateTime(detail.analyzedAt) : "-"}
                    </Field>
                    <Field label="차원">
                      <span className="catalog-stat">{detail.dimension.toLocaleString()}</span>
                    </Field>
                    <Field label="L2 노름">
                      <span className="catalog-stat">{detail.norm?.toFixed(4) ?? "-"}</span>
                    </Field>
                    <Field label="최소 / 최대">
                      <span className="catalog-stat">
                        {detail.stats ? `${detail.stats.min.toFixed(3)} / ${detail.stats.max.toFixed(3)}` : "-"}
                      </span>
                    </Field>
                    <Field label="평균">
                      <span className="catalog-stat">{detail.stats?.mean.toFixed(4) ?? "-"}</span>
                    </Field>
                  </dl>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      벡터 앞 {detail.preview.length}차원 — 위(민트) 양수, 아래(핑크) 음수
                    </p>
                    <div className="rounded-sm border border-border bg-card px-2 py-1 text-foreground">
                      <EmbeddingSparkline values={detail.preview} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      저장된 임베딩 기준 유사 카드(같은 그룹·멤버) — 30% 이상
                    </p>
                    {detail.similar.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">비슷한 카드가 없어요.</p>
                    ) : (
                      <ul className="scroll-x mt-2 flex gap-2 overflow-x-auto pb-1">
                        {detail.similar.map((m) => {
                          const src = cardImageSrc({ frontR2Key: m.frontR2Key }, imageView);
                          return (
                            <li key={m.id} className="w-16 shrink-0">
                              <div className="relative aspect-[63/88] overflow-hidden rounded-sm border border-border bg-lilac">
                                {src && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={src} alt={m.name} loading="lazy" className="h-full w-full object-cover" />
                                )}
                                <span className="absolute right-0 top-0 rounded-bl-sm bg-primary/90 px-1 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                  {Math.round(m.score * 100)}%
                                </span>
                              </div>
                              <p className="mt-1 truncate text-[10px] text-muted-foreground" title={m.name}>
                                #{m.id} 포즈 {m.pose}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{children}</dd>
    </div>
  );
}
