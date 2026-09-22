"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberCombobox } from "@/modules/members/components/MemberCombobox";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import type { SeriesOption } from "@/modules/series/lib/queries";
import { searchCatalogCardsForProduct, type CatalogCardPick } from "../actions";

type Props = {
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
  catalogPublicBase: string;
  selectable: "single" | "multi";
  /** single 모드에서 카드를 탭했을 때. */
  onPick?: (card: CatalogCardPick) => void;
  /** multi 모드에서 선택된 카드 id 집합(부모 소유). */
  selectedIds?: Set<number>;
  /** multi 모드에서 카드 선택 토글. */
  onToggle?: (card: CatalogCardPick) => void;
  /** multi 모드에서 "이 페이지 전체 선택" 대상으로 쓰도록, 현재 보이는 카드를 부모에 알린다. */
  onVisibleChange?: (cards: CatalogCardPick[]) => void;
};

// 상품 등록용 카탈로그(토레카 마스터) 카드 브라우저 — 단건 폼 피커와 일괄 등록 다이얼로그가 공유한다.
// 검색·그룹/멤버/시리즈 필터·미등록만 보기·더 보기·아이템코드/정가 표시를 담고, 선택 UI만 모드로 갈린다.
export function CatalogCardBrowser({
  teams,
  members,
  series,
  catalogPublicBase,
  selectable,
  onPick,
  selectedIds,
  onToggle,
  onVisibleChange,
}: Props) {
  const [q, setQ] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [seriesId, setSeriesId] = useState<number | null>(null);
  const [hideRegistered, setHideRegistered] = useState(true);

  const [cards, setCards] = useState<CatalogCardPick[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, startLoad] = useTransition();
  // 필터 조합의 세대 — 응답이 늦게 도착해도 최신 세대만 반영(경쟁 상태 방지).
  const genRef = useRef(0);

  const memberName = useCallback(
    (id: number | null) => (id == null ? "" : (members.find((m) => m.id === id)?.name ?? "")),
    [members],
  );
  const seriesLabel = useCallback(
    (id: number | null) => (id == null ? "" : (series.find((s) => s.id === id)?.label ?? "")),
    [series],
  );

  const seriesForTeam = useMemo(
    () => (teamId == null ? series : series.filter((s) => s.teamId === teamId)),
    [series, teamId],
  );

  // 페이지 p 를 불러온다. p===1 이면 교체, 아니면 이어 붙인다.
  const load = useCallback(
    (p: number) => {
      const gen = ++genRef.current;
      startLoad(async () => {
        const res = await searchCatalogCardsForProduct({
          q: q.trim() || undefined,
          teamId,
          memberId,
          seriesId,
          page: p,
        });
        if (gen !== genRef.current) return; // 더 최신 요청이 있으면 버린다
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setTotal(res.data.total);
        setPage(p);
        setCards((prev) => (p === 1 ? res.data.items : [...prev, ...res.data.items]));
      });
    },
    [q, teamId, memberId, seriesId],
  );

  // 필터가 바뀌면 1페이지부터 다시. (검색어는 제출 시 load(1) 직접 호출)
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, memberId, seriesId]);

  const visible = useMemo(
    () => (hideRegistered ? cards.filter((c) => !c.registered) : cards),
    [cards, hideRegistered],
  );

  useEffect(() => {
    onVisibleChange?.(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const hasMore = cards.length < total;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 검색 + 필터 — 상단 고정 */}
      <div className="space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
          className="flex gap-2"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="카드 이름·아이템 코드 검색"
            className="flex-1"
            inputMode="search"
          />
          <Button type="submit" size="sm" disabled={loading}>
            <Search className="h-3.5 w-3.5" />
            <span className="ml-1 hidden sm:inline">검색</span>
          </Button>
        </form>

        <div className="scroll-x scroll-x-fade -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => { setTeamId(null); setMemberId(null); setSeriesId(null); }} className={chip(teamId === null)}>
            모든 그룹
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTeamId(t.id); setMemberId(null); setSeriesId(null); }}
              className={chip(teamId === t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MemberCombobox members={members} teamId={teamId} value={memberId} onChange={setMemberId} />
          <Select
            value={seriesId == null ? "all" : String(seriesId)}
            onValueChange={(v) => setSeriesId(v === "all" ? null : Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="시리즈 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">시리즈 전체</SelectItem>
              {seriesForTeam.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hideRegistered}
            onChange={(e) => setHideRegistered(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          이미 등록된 카드 숨기기
        </label>
      </div>

      {/* 결과 그리드 — 내부 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && cards.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            조건에 맞는 카드가 없어요.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-4">
              {visible.map((card) => {
                const selected = selectedIds?.has(card.id) ?? false;
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectable === "multi") onToggle?.(card);
                        else onPick?.(card);
                      }}
                      aria-pressed={selectable === "multi" ? selected : undefined}
                      className={[
                        "group relative w-full overflow-hidden rounded-lg border bg-card text-left transition-colors",
                        selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary",
                      ].join(" ")}
                    >
                      <div className="relative aspect-[63/88] w-full bg-muted">
                        {card.frontR2Key ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`${catalogPublicBase}/${card.frontR2Key}`}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                        {selectable === "multi" && (
                          <span
                            className={[
                              "absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-primary-foreground transition-colors",
                              selected ? "border-primary bg-primary" : "border-white/80 bg-black/30",
                            ].join(" ")}
                          >
                            {selected && <Check className="h-3.5 w-3.5" />}
                          </span>
                        )}
                        {card.registered && (
                          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            등록됨
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5 p-1.5">
                        <p className="truncate text-xs font-medium">{memberName(card.memberId) || card.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {seriesLabel(card.seriesId)} · #{card.pose}
                        </p>
                        <p className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                          <span className="truncate">{card.itemCode ?? ""}</span>
                          {card.retailPriceJpy > 0 && (
                            <span className="shrink-0 tabular-nums">¥{card.retailPriceJpy.toLocaleString()}</span>
                          )}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <div className="py-3 text-center">
                <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => load(page + 1)}>
                  {loading ? "불러오는 중…" : "더 보기"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
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
