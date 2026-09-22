"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import type { SeriesOption } from "@/modules/series/lib/queries";
import { CatalogCardBrowser } from "./CatalogCardBrowser";
import { bulkCreateProductsFromCards, type CatalogCardPick } from "../actions";

type Props = {
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
  catalogPublicBase: string;
};

const MAX = 50;
// 카드 1장당 이미지 다운로드·리사이즈·워터마크·R2 업로드 2회·DB 삽입이 직렬로 돈다.
// 한 요청에 몰면 게이트웨이 타임아웃(504)·Server Action 응답 초과가 난다 → 작은 배치로 쪼개
// 여러 번 호출하고 진행률을 보여준다. 각 배치는 독립(카드 간 공유 트랜잭션 없음).
const CHUNK = 5;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 토레카 일괄 등록 — 카탈로그 카드를 여러 장 골라 카드당 초안 상품을 한 번에 생성한다.
// 판매가는 토글이 켜져 있으면 오늘 환율×정가로 제안되고, 매입 정보는 등록 후 각 상품에서 채운다.
export function CatalogBulkImport({ teams, members, series, catalogPublicBase }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Map<number, CatalogCardPick>>(new Map());
  const [useRate, setUseRate] = useState(true);
  const [submitting, startSubmit] = useTransition();
  // 처리 진행률(등록 완료한 카드 수). submitting 동안만 의미 있음.
  const [done, setDone] = useState(0);
  // 현재 화면에 보이는(미등록 필터 적용된) 카드 — "전체 선택" 대상.
  const visibleRef = useRef<CatalogCardPick[]>([]);

  // 처리 중 창을 닫으면 진행 중 등록이 끊긴다 — 브라우저 이탈 경고.
  useEffect(() => {
    if (!submitting) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [submitting]);

  const toggle = useCallback((card: CatalogCardPick) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(card.id)) next.delete(card.id);
      else if (next.size < MAX) next.set(card.id, card);
      else toast.error(`한 번에 최대 ${MAX}장까지 선택할 수 있어요`);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of visibleRef.current) {
        if (next.size >= MAX) break;
        if (!next.has(c.id)) next.set(c.id, c);
      }
      if (visibleRef.current.length > 0 && next.size >= MAX) {
        toast.message(`최대 ${MAX}장까지만 선택했어요`);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Map()), []);

  const reset = useCallback(() => {
    setSelected(new Map());
    setUseRate(true);
  }, []);

  function submit() {
    const cardIds = [...selected.keys()];
    if (cardIds.length === 0) {
      toast.error("등록할 카드를 선택해 주세요");
      return;
    }
    startSubmit(async () => {
      // 작은 배치로 쪼개 순차 호출 — 각 요청이 짧아 504·응답 초과를 피하고 진행률을 갱신한다.
      setDone(0);
      let created = 0;
      let skipped = 0;
      for (const batch of chunk(cardIds, CHUNK)) {
        const res = await bulkCreateProductsFromCards({
          cardIds: batch,
          useRateForSalePrice: useRate,
        });
        if (!res.ok) {
          // 지금까지 등록된 분은 이미 커밋됨 — 진행분을 알리고 중단(재시도 시 등록분은 자동 skip).
          toast.error(
            `${res.message}` +
              (created > 0 ? ` · ${created}개는 등록됨(나머지 다시 시도해 주세요)` : ""),
          );
          setDone(0);
          router.refresh();
          return;
        }
        created += res.data.created;
        skipped += res.data.skipped.length;
        setDone((d) => d + batch.length);
      }
      if (created > 0) {
        toast.success(
          `초안 상품 ${created}개를 등록했어요` + (skipped > 0 ? ` · ${skipped}장 건너뜀` : ""),
        );
      } else {
        toast.message(`등록된 카드가 없어요 · ${skipped}장 건너뜀`);
      }
      setDone(0);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const count = selected.size;
  const progressPct = count > 0 ? Math.round((done / count) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // 등록 처리 중에는 닫기·재클릭으로 인한 중단을 막는다.
        if (submitting) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-1.5">
          <Layers className="h-4 w-4" />
          토레카 일괄 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>토레카 일괄 등록</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={selectAllVisible} disabled={submitting}>
            보이는 카드 전체 선택
          </Button>
          {count > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={clearSelection} disabled={submitting}>
              선택 해제
            </Button>
          )}
          <span className="text-muted-foreground">최대 {MAX}장</span>
        </div>

        <CatalogCardBrowser
          teams={teams}
          members={members}
          series={series}
          catalogPublicBase={catalogPublicBase}
          selectable="multi"
          selectedIds={new Set(selected.keys())}
          onToggle={toggle}
          onVisibleChange={(cards) => {
            visibleRef.current = cards;
          }}
        />

        {/* 하단 고정 액션 바 */}
        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t border-border bg-background px-6 py-3">
          {/* 진행률 — 처리 중에만 노출. 배치 완료마다 done 증가. */}
          {submitting && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>등록 중… 창을 닫지 마세요</span>
                <span className="tabular-nums">
                  {done} / {count} ({progressPct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={useRate}
                onChange={(e) => setUseRate(e.target.checked)}
                disabled={submitting}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              정가×오늘환율로 판매가 자동 제안
            </label>
            <Button
              type="button"
              className="h-11 w-full sm:w-auto"
              disabled={submitting || count === 0}
              onClick={submit}
            >
              {submitting ? `등록 중… ${done}/${count}` : `${count}개 초안 등록`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
