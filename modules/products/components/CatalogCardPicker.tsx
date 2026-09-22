"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  searchCatalogCardsForProduct,
  type CatalogCardPick,
} from "../actions";

type Props = {
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
  catalogPublicBase: string;
  /** 선택 시 폼 필드를 채운다. 이미지 복사는 부모가 별도로 처리한다. */
  onPick: (card: CatalogCardPick) => void;
};

// 상품 등록 시 공유 카탈로그(토레카 마스터)에서 실제 카드를 골라 그룹·멤버·시리즈·이름·정가·이미지를
// 한 번에 불러온다. 카탈로그·커머스 DB 는 분리돼 있어 여기서 읽은 id 값만 상품에 참조로 저장된다.
export function CatalogCardPicker({
  teams,
  members,
  series,
  catalogPublicBase,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [cards, setCards] = useState<CatalogCardPick[]>([]);
  const [loading, startLoad] = useTransition();

  const memberName = useCallback(
    (id: number | null) =>
      id == null ? "" : (members.find((m) => m.id === id)?.name ?? ""),
    [members],
  );
  const seriesLabel = useCallback(
    (id: number | null) =>
      id == null ? "" : (series.find((s) => s.id === id)?.label ?? ""),
    [series],
  );

  const load = useCallback(() => {
    startLoad(async () => {
      const res = await searchCatalogCardsForProduct({
        q: q.trim() || undefined,
        teamId,
      });
      if (res.ok) setCards(res.data);
      else toast.error(res.message);
    });
  }, [q, teamId]);

  // 다이얼로그를 열거나 그룹 필터가 바뀌면 다시 불러온다(검색어는 제출 시).
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          카탈로그에서 토레카 불러오기
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>토레카 불러오기</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="flex gap-2"
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="카드 이름·아이템 코드 검색"
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={loading}>
              검색
            </Button>
          </form>
          <div className="scroll-x scroll-x-fade -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => setTeamId(null)}
              className={chip(teamId === null)}
            >
              모든 그룹
            </button>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeamId(t.id)}
                className={chip(teamId === t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : cards.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              조건에 맞는 카드가 없어요.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-4">
              {cards.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(card);
                      setOpen(false);
                    }}
                    className="group w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary"
                  >
                    <div className="aspect-[63/88] w-full bg-muted">
                      {card.frontR2Key ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${catalogPublicBase}/${card.frontR2Key}`}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-0.5 p-1.5">
                      <p className="truncate text-xs font-medium">{memberName(card.memberId)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {seriesLabel(card.seriesId)} · #{card.pose}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function chip(active: boolean): string {
  return [
    "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-border text-muted-foreground hover:border-primary/50",
  ].join(" ");
}
