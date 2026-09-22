"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// 카드 상세 — 카탈로그(관리)에서 한 장의 모든 것. 위(≥sm 왼쪽)에 clean 원본을 크게, 오른쪽에 핵심 정보를
// 정의 목록으로: 그룹 · 멤버(한글+일본어) · 시리즈(라벨+종류+SKU) · 포즈 · 아이템 코드 · 정가 · 상태 · 등록/제보.
// AI 분석값(모델·차원·노름·스파크라인·유사 카드)은 접힌 「AI 분석」 아래 — 펼칠 때 서버 액션으로 읽는다(Bedrock 호출 없음).
// 액션(편집·같은 시리즈 보기·삭제)은 맨 아래 한 줄, 폰에서는 줄바꿈.
export function CardDetailDialog({
  card,
  teamName,
  memberName,
  memberNameJa,
  seriesLabel,
  seriesKindLabel,
  seriesSku,
  imageView,
  onClose,
  onEdit,
  onDelete,
}: {
  card: Card;
  teamName?: string;
  memberName?: string;
  memberNameJa?: string | null;
  seriesLabel?: string;
  seriesKindLabel?: string;
  seriesSku?: string;
  imageView: CardImageView;
  onClose: () => void;
  /** 편집 다이얼로그 열기 — 넘기지 않으면 버튼을 감춘다. */
  onEdit?: () => void;
  /** 삭제(확인은 호출자가) — 넘기지 않으면 버튼을 감춘다. */
  onDelete?: () => void;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [detail, setDetail] = useState<CardAnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = cardImageSrc(card, imageView);

  // 분석값은 「AI 분석」을 처음 펼칠 때 한 번만 읽는다.
  useEffect(() => {
    if (!aiOpen || detail || error) return;
    let alive = true;
    getCardAnalysisDetail(card.id).then((res) => {
      if (!alive) return;
      if (res.ok) setDetail(res.data);
      else setError(res.message);
    });
    return () => {
      alive = false;
    };
  }, [aiOpen, detail, error, card.id]);

  const listHref =
    card.seriesId !== null
      ? `/admin/catalog/cards?${[
          card.teamId !== null ? `team=${card.teamId}` : null,
          card.memberId !== null ? `member=${card.memberId}` : null,
          `series=${card.seriesId}`,
        ]
          .filter(Boolean)
          .join("&")}`
      : null;
  const submitted = card.submittedByAccountId !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="catalog-mono text-sm text-muted-foreground">#{card.id}</span>
            <span className="min-w-0 break-keep">{card.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,240px)_1fr]">
          {/* 이미지 — 폰에서는 위에 크게(폭 제한), sm 부터 왼쪽 */}
          <div className="mx-auto w-full max-w-[16rem] space-y-1.5 sm:mx-0 sm:max-w-none">
            <div className="aspect-[63/88] overflow-hidden rounded-md border border-border bg-lilac shadow-card">
              {url && (
                // eslint-disable-next-line @next/next/no-img-element -- 카탈로그 clean 원본 프록시
                <img src={url} alt={card.name} className="h-full w-full object-cover" />
              )}
            </div>
            {imageView.kind === "admin" && (
              <p className="text-center text-[11px] text-muted-foreground">워터마크 없는 원본</p>
            )}
          </div>

          {/* 핵심 정보 — 정의 목록 */}
          <dl className="min-w-0 divide-y divide-border/70 text-sm">
            <Row label="그룹">{teamName ?? "-"}</Row>
            <Row label="멤버">
              {memberName ?? "-"}
              {memberNameJa && <span className="ml-1.5 text-xs text-muted-foreground">{memberNameJa}</span>}
            </Row>
            <Row label="시리즈">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="min-w-0 break-keep">{seriesLabel ?? "-"}</span>
                {seriesKindLabel && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                    {seriesKindLabel}
                  </Badge>
                )}
                {seriesSku && <span className="catalog-mono text-xs text-muted-foreground">{seriesSku}</span>}
              </span>
            </Row>
            <Row label="포즈">
              <span className="catalog-stat font-semibold">#{card.pose}</span>
            </Row>
            <Row label="아이템 코드">
              {card.itemCode ? <span className="catalog-mono break-all">{card.itemCode}</span> : "-"}
            </Row>
            <Row label="정가 (JPY)">
              {card.retailPriceJpy ? (
                <span className="catalog-stat">¥{card.retailPriceJpy.toLocaleString()}</span>
              ) : (
                "-"
              )}
            </Row>
            <Row label="상태">
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={card.status === "active" ? "outline" : card.status === "rejected" ? "destructive" : "default"}
                  className="px-2 py-0 text-[11px]"
                >
                  {CARD_STATUS_LABEL[card.status]}
                </Badge>
                <Badge
                  variant={card.analyzedAt ? "secondary" : "outline"}
                  className="gap-1 px-2 py-0 text-[11px]"
                  title={card.analyzedAt ? `AI 분석 완료 · ${card.analysisModel ?? ""}` : "AI 미분석"}
                >
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  {card.analyzedAt ? "AI 분석됨" : "미분석"}
                </Badge>
              </span>
            </Row>
            <Row label={submitted ? "제보" : "등록"}>
              <span className="block">
                {submitted ? "유저 제보" : "관리자 등록"} · {formatKstDateTime(card.createdAt)}
              </span>
              {card.updatedAt !== card.createdAt && (
                <span className="block text-xs text-muted-foreground">수정 {formatKstDateTime(card.updatedAt)}</span>
              )}
              {card.status === "rejected" && card.reviewNote && (
                <span className="block text-xs text-destructive">반려 사유: {card.reviewNote}</span>
              )}
            </Row>
          </dl>
        </div>

        {/* AI 분석 — 접힘. 펼칠 때 저장된 임베딩 요약·스파크라인·유사 카드를 읽는다. */}
        <details
          className="group rounded-md border border-border bg-muted/40"
          onToggle={(e) => setAiOpen(e.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5 font-display text-base">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              AI 분석
              <span className="text-xs font-normal text-muted-foreground">
                {card.analyzedAt ? card.analysisModel ?? "분석됨" : "미분석"}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-border/70 px-4 py-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!detail && !error && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
            {detail && detail.dimension === 0 && (
              <p className="text-sm text-muted-foreground">
                아직 분석되지 않았어요 — 승인·저장 시점에 앞면(clean)을 임베딩해요.
              </p>
            )}
            {detail && detail.dimension > 0 && (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                  <Field label="모델">
                    <span className="catalog-mono break-all text-xs">{detail.model ?? "-"}</span>
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
          </div>
        </details>

        {/* 액션 — 폰에서 줄바꿈, 삭제는 오른쪽 끝 */}
        {(onEdit || listHref || onDelete) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
            {onEdit && (
              <Button variant="outline" size="sm" className="h-10 gap-1.5 sm:h-9" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
                편집
              </Button>
            )}
            {listHref && (
              <Button asChild variant="ghost" size="sm" className="h-10 gap-1.5 sm:h-9">
                <Link href={listHref} onClick={onClose}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  같은 시리즈 카드 보기
                </Link>
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-10 gap-1.5 text-muted-foreground hover:text-destructive sm:h-9"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// 정의 목록 한 줄 — 라벨은 왼쪽 고정 폭, 값은 줄바꿈 허용(폰에서 잘리지 않게).
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
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
