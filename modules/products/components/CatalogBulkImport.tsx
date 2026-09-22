"use client";

import { useCallback, useRef, useState, useTransition } from "react";
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

// 토레카 일괄 등록 — 카탈로그 카드를 여러 장 골라 카드당 초안 상품을 한 번에 생성한다.
// 판매가는 토글이 켜져 있으면 오늘 환율×정가로 제안되고, 매입 정보는 등록 후 각 상품에서 채운다.
export function CatalogBulkImport({ teams, members, series, catalogPublicBase }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Map<number, CatalogCardPick>>(new Map());
  const [useRate, setUseRate] = useState(true);
  const [submitting, startSubmit] = useTransition();
  // 현재 화면에 보이는(미등록 필터 적용된) 카드 — "전체 선택" 대상.
  const visibleRef = useRef<CatalogCardPick[]>([]);

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
      const res = await bulkCreateProductsFromCards({ cardIds, useRateForSalePrice: useRate });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const { created, skipped } = res.data;
      if (created > 0) {
        toast.success(
          `초안 상품 ${created}개를 등록했어요` +
            (skipped.length > 0 ? ` · ${skipped.length}장 건너뜀` : ""),
        );
      } else {
        toast.message(`등록된 카드가 없어요 · ${skipped.length}장 건너뜀`);
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const count = selected.size;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
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
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={selectAllVisible}>
            보이는 카드 전체 선택
          </Button>
          {count > 0 && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={clearSelection}>
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
        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t border-border bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={useRate}
              onChange={(e) => setUseRate(e.target.checked)}
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
            {submitting ? "등록 중…" : `${count}개 초안 등록`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
