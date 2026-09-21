"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HScroll } from "@/components/HScroll";
import { findSimilarCards, type SimilarCardsResult } from "../actions";

type Match = SimilarCardsResult["matches"][number];

// AI 유사 카드 패널 — 업로드한 앞면을 임베딩해 같은 그룹/멤버의 공개 카드와 코사인 비교.
// 토레카분석기의 "저장 전 비교" 단계를 웹 등록 폼에 붙인 것. 중복 등록을 눈으로 확인시켜 준다.
export function CardSimilarPanel({
  frontR2Key,
  teamId,
  memberId,
  publicBaseUrl,
}: {
  frontR2Key: string | null;
  teamId: number | null;
  memberId: number | null;
  publicBaseUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SimilarCardsResult | null>(null);

  function run() {
    if (!frontR2Key) {
      toast.error("먼저 앞면 이미지를 올려주세요");
      return;
    }
    startTransition(async () => {
      const res = await findSimilarCards({ frontR2Key, teamId, memberId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setResult(res.data);
      if (res.data.configured && res.data.matches.length === 0) {
        toast.success("비슷한 카드를 찾지 못했어요 — 새 카드로 보여요");
      }
    });
  }

  function matchUrl(m: Match): string | null {
    return m.frontR2Key ? `${publicBaseUrl}/${m.frontR2Key}` : null;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 유사 카드 찾기
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            올린 앞면 이미지를 분석해 이미 등록된 비슷한 카드를 찾아줘요.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending || !frontR2Key}
          onClick={run}
        >
          {pending ? "분석 중…" : "분석"}
        </Button>
      </div>

      {result && !result.configured && (
        <p className="text-xs text-muted-foreground">
          AI 이미지 분석이 아직 설정되지 않았어요 — 등록은 정상 진행되며, 설정 후
          등록하는 카드부터 분석돼요.
        </p>
      )}

      {result?.configured && result.matches.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            유사도 높은 순 {result.matches.length}장 — 같은 카드라면 새로 등록하지
            않아도 돼요.
          </p>
          <HScroll className="scroll-x flex gap-2 overflow-x-auto pb-1">
            {result.matches.map((m) => {
              const url = matchUrl(m);
              const pct = Math.round(m.score * 100);
              return (
                <figure key={m.id} className="w-20 shrink-0">
                  <div className="relative aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted">
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={m.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute right-0 top-0 rounded-bl-sm bg-primary/90 px-1 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {pct}%
                    </span>
                  </div>
                  <figcaption className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                    포즈 {m.pose} · {m.name}
                  </figcaption>
                </figure>
              );
            })}
          </HScroll>
        </>
      )}
    </div>
  );
}
