"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveCards,
  deleteCard,
  rejectCards,
  reviewCard,
  updateCard,
} from "../actions";
import {
  CARD_STATUS_LABEL,
  cardImageSrc,
  type CardImageView,
  type Card,
} from "../types";
import { kindLabelOf, type KindOption } from "@/modules/series/lib/kind-options";
import type {
  MemberOption,
  SeriesOption,
  TeamOption,
} from "./CardForm";
import { CardSimilarPanel } from "./CardSimilarPanel";
import { CardDetailDialog } from "./CardDetailDialog";

// 관리자 토레카 표 — 검수 대기 카드를 한 장씩(수정·승인·반려) 또는
// 여러 장 선택해 한 번에 승인할 수 있다.
export function CardTable({
  items,
  teams,
  members,
  series,
  kinds = [],
  imageView,
}: {
  items: Card[];
  teams: TeamOption[];
  members: MemberOption[];
  series: SeriesOption[];
  /** 종류 라벨(DB) — 상세 다이얼로그의 종류 배지용. */
  kinds?: KindOption[];
  imageView: CardImageView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Card | null>(null);
  const [noteById, setNoteById] = useState<Record<number, string>>({});
  // 검수 보조 — 보류 카드의 기존·유사 카드를 AI로 확인하는 다이얼로그 대상.
  const [similarFor, setSimilarFor] = useState<Card | null>(null);
  // 상세(clean 원본·저장된 AI 분석값) 다이얼로그 대상.
  const [detailFor, setDetailFor] = useState<Card | null>(null);

  const teamById = new Map(teams.map((t) => [t.id, t.name]));
  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const memberRowById = new Map(members.map((m) => [m.id, m]));
  const seriesById = new Map(series.map((s) => [s.id, s.label]));
  const seriesRowById = new Map(series.map((s) => [s.id, s]));
  const pendingItems = items.filter((c) => c.status === "pending");
  const allPendingSelected =
    pendingItems.length > 0 && pendingItems.every((c) => selected.has(c.id));

  function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    done: string,
  ) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "실패했어요");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  function bulkApprove() {
    const ids = [...selected];
    startTransition(async () => {
      const result = await approveCards(ids);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${result.data.approved}장 승인 — 카탈로그에 공개됐어요`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function bulkReject() {
    const ids = [...selected];
    const note = window.prompt("반려 사유 (선택 — 제보자에게 참고용)") ?? undefined;
    startTransition(async () => {
      const result = await rejectCards(ids, note || undefined);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${result.data.rejected}장 반려했어요`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const approve = (card: Card) =>
    run(() => reviewCard(card.id, "approve"), "승인 — 공개됐어요");
  const reject = (card: Card) =>
    run(() => reviewCard(card.id, "reject", noteById[card.id]), "반려했어요");
  const remove = (card: Card) => {
    if (!window.confirm(`「${card.name}」 카드를 삭제할까요?`)) return;
    run(() => deleteCard(card.id), "삭제했어요");
  };
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hierarchyOf = (card: Card) =>
    card.memberId !== null
      ? (memberById.get(card.memberId) ?? "-")
      : card.teamId !== null
        ? teamById.get(card.teamId)
        : "-";

  // 반려 사유 입력 — 표에서는 짝은 폭, 폰 카드에서는 전체 폭.
  const noteInput = (card: Card, className: string) => (
    <input
      value={noteById[card.id] ?? ""}
      onChange={(e) => setNoteById((prev) => ({ ...prev, [card.id]: e.target.value }))}
      placeholder="반려 사유"
      aria-label={`${card.name} 반려 사유`}
      className={`rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50 ${className}`}
    />
  );

  // 검수 액션(유사·수정·승인·반려) — layout 에 따라 표용(작게) / 폰 카드용(44px, 줄바꿈) 크기.
  const pendingActions = (card: Card, layout: "table" | "card") => {
    const tall = layout === "card";
    const h = tall ? "h-11" : "h-8";
    return (
      <div className={tall ? "flex flex-wrap gap-1.5" : "flex flex-wrap items-center justify-end gap-1"}>
        {!tall && noteInput(card, "h-8 w-24")}
        <Button
          size="sm"
          className={`${h} gap-1 px-2 text-xs ${tall ? "flex-1" : ""}`}
          disabled={pending}
          onClick={() => approve(card)}
        >
          <Check className="h-3.5 w-3.5" />
          승인
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={`${h} gap-1 px-2 text-xs ${tall ? "flex-1" : ""}`}
          disabled={pending}
          onClick={() => reject(card)}
        >
          <X className="h-3.5 w-3.5" />
          반려
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${h} gap-1 px-2 text-xs`}
          aria-label={`${card.name} 유사 카드 보기`}
          title="AI로 기존·유사 카드 확인 (저장 전 비교)"
          disabled={pending || !card.frontR2Key}
          onClick={() => setSimilarFor(card)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          유사
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={tall ? "h-11 w-11 p-0" : "h-8 w-8 p-0"}
          aria-label={`${card.name} 수정`}
          disabled={pending}
          onClick={() => setEditing(card)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // 공개·반려 카드 액션(상세·수정·삭제).
  const settledActions = (card: Card, layout: "table" | "card") => {
    const tall = layout === "card";
    const h = tall ? "h-11" : "h-8";
    return (
      <div className={tall ? "flex flex-wrap gap-1.5" : "flex items-center justify-end gap-0.5"}>
        <Button
          variant="ghost"
          size="sm"
          className={`${h} gap-1 px-2 text-xs text-primary`}
          aria-label={`${card.name} 상세·AI 분석값`}
          onClick={() => setDetailFor(card)}
        >
          <Info className="h-3.5 w-3.5" />
          상세
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${h} gap-1 px-2 text-xs`}
          aria-label={`${card.name} 수정`}
          disabled={pending}
          onClick={() => setEditing(card)}
        >
          <Pencil className="h-4 w-4" />
          {tall && "수정"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${h} gap-1 px-2 text-xs text-muted-foreground hover:text-destructive`}
          aria-label={`${card.name} 삭제`}
          disabled={pending}
          onClick={() => remove(card)}
        >
          <Trash2 className="h-4 w-4" />
          {tall && "삭제"}
        </Button>
      </div>
    );
  };

  const statusBadge = (card: Card) =>
    card.status !== "active" ? (
      <Badge
        className={
          card.status === "pending"
            ? "whitespace-nowrap"
            : "whitespace-nowrap bg-destructive hover:bg-destructive"
        }
      >
        {CARD_STATUS_LABEL[card.status]}
      </Badge>
    ) : (
      <span className="text-xs text-muted-foreground">
        {CARD_STATUS_LABEL.active}
        {card.submittedByAccountId && " · 제보"}
      </span>
    );

  return (
    <>
      {/* 폰 — 검수 큐를 카드 리스트로. 사유 입력은 전체 폭, 버튼은 44px·줄바꿈. */}
      <ul className="space-y-3 md:hidden">
        {pendingItems.length > 0 && (
          <li className="flex items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={() =>
                setSelected(
                  allPendingSelected ? new Set() : new Set(pendingItems.map((c) => c.id)),
                )
              }
              className="h-5 w-5 cursor-pointer accent-primary"
              id="card-review-select-all"
            />
            <label htmlFor="card-review-select-all" className="cursor-pointer text-muted-foreground">
              검수 대기 전체 선택
            </label>
          </li>
        )}
        {items.map((card) => {
          const frontUrl = cardImageSrc(card, imageView);
          const isPending = card.status === "pending";
          return (
            <li key={card.id} className="rounded-md border border-border bg-card p-3 shadow-card">
              <div className="flex items-start gap-3">
                {isPending && (
                  <input
                    type="checkbox"
                    checked={selected.has(card.id)}
                    onChange={() => toggle(card.id)}
                    className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-primary"
                    aria-label={`${card.name} 선택`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setDetailFor(card)}
                  aria-label={`${card.name} 상세 보기`}
                  className="block h-[5.25rem] w-[3.75rem] shrink-0 overflow-hidden rounded-xs border border-border bg-lilac"
                >
                  {frontUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={frontUrl} alt={card.name} loading="lazy" className="h-full w-full object-cover" />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-medium">
                    <span className="catalog-mono mr-1 text-muted-foreground">#{card.id}</span>
                    {card.name}
                  </p>
                  {card.itemCode && (
                    <p className="catalog-mono break-all text-muted-foreground">{card.itemCode}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {hierarchyOf(card)}
                    {card.seriesId !== null && ` · ${seriesById.get(card.seriesId) ?? "-"}`}
                    {card.seriesId !== null && ` · 포즈 ${card.pose}`}
                  </p>
                  <div className="pt-0.5">{statusBadge(card)}</div>
                  {card.status === "rejected" && card.reviewNote && (
                    <p className="text-xs text-destructive">반려: {card.reviewNote}</p>
                  )}
                </div>
              </div>
              {isPending ? (
                <div className="mt-3 space-y-2">
                  {noteInput(card, "h-11 w-full")}
                  {pendingActions(card, "card")}
                </div>
              ) : (
                <div className="mt-3">{settledActions(card, "card")}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* md+ — 작업 표 */}
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              {pendingItems.length > 0 && (
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  onChange={() =>
                    setSelected(
                      allPendingSelected
                        ? new Set()
                        : new Set(pendingItems.map((c) => c.id)),
                    )
                  }
                  className="h-4 w-4 cursor-pointer accent-primary align-middle"
                  aria-label="검수 대기 전체 선택"
                />
              )}
            </TableHead>
            <TableHead className="text-right">#</TableHead>
            <TableHead>앞면</TableHead>
            <TableHead>카드 이름</TableHead>
            <TableHead>멤버 / 시리즈</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">작업</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((card) => {
            const frontUrl = cardImageSrc(card, imageView);
            const isPending = card.status === "pending";
            return (
              <TableRow key={card.id}>
                <TableCell>
                  {isPending && (
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      onChange={() => toggle(card.id)}
                      className="h-4 w-4 cursor-pointer accent-primary align-middle"
                      aria-label={`${card.name} 선택`}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {card.id}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setDetailFor(card)}
                    aria-label={`${card.name} 상세 보기`}
                    className="block h-14 w-10 overflow-hidden rounded-xs border border-border bg-lilac transition-transform hover:scale-105"
                  >
                    {frontUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={frontUrl}
                        alt={card.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{card.name}</p>
                  {card.itemCode && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {card.itemCode}
                    </p>
                  )}
                  {card.status === "rejected" && card.reviewNote && (
                    <p className="text-xs text-destructive">
                      반려: {card.reviewNote}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {hierarchyOf(card)}
                  {card.seriesId !== null && (
                    <p className="text-xs text-muted-foreground">
                      {seriesById.get(card.seriesId) ?? "-"}
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        포즈 {card.pose}
                      </span>
                    </p>
                  )}
                </TableCell>
                <TableCell>{statusBadge(card)}</TableCell>
                <TableCell>
                  {isPending ? pendingActions(card, "table") : settledActions(card, "table")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {/* 일괄 승인 바 — 검수 대기 카드를 여러 장 선택했을 때. 폰에서도 줄바꿈으로 버튼이 잘리지 않게. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-elevated">
            <span className="shrink-0 text-sm font-bold">{selected.size}장 선택</span>
            <Button size="sm" className="shrink-0" disabled={pending} onClick={bulkApprove}>
              {pending ? "처리 중…" : "한 번에 승인"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="shrink-0"
              disabled={pending}
              onClick={bulkReject}
            >
              한 번에 반려
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              disabled={pending}
              onClick={() => setSelected(new Set())}
            >
              선택 해제
            </Button>
          </div>
        </div>
      )}

      {/* 검수 보조 — 보류 카드 앞면을 AI로 분석해 기존·유사 카드를 보여준다(저장 전 비교).
          분석 결과는 저장하지 않고, 승인 시점에 다시 분석해 임베딩을 저장한다. */}
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

      {detailFor && (
        <CardDetailDialog
          card={detailFor}
          teamName={detailFor.teamId !== null ? teamById.get(detailFor.teamId) : undefined}
          memberName={detailFor.memberId !== null ? memberById.get(detailFor.memberId) : undefined}
          memberNameJa={detailFor.memberId !== null ? memberRowById.get(detailFor.memberId)?.nameJa : undefined}
          seriesLabel={detailFor.seriesId !== null ? seriesById.get(detailFor.seriesId) : undefined}
          seriesKindLabel={
            detailFor.seriesId !== null && seriesRowById.get(detailFor.seriesId)
              ? kindLabelOf(kinds, seriesRowById.get(detailFor.seriesId)!.kind)
              : undefined
          }
          seriesSku={detailFor.seriesId !== null ? seriesRowById.get(detailFor.seriesId)?.sku : undefined}
          imageView={imageView}
          onClose={() => setDetailFor(null)}
          onEdit={() => {
            setEditing(detailFor);
            setDetailFor(null);
          }}
          onDelete={() => {
            const target = detailFor;
            setDetailFor(null);
            remove(target);
          }}
        />
      )}

      {/* 개별 수정 — 멤버/시리즈 교정 시 이름도 자동 재생성 */}
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

// 개별 수정 다이얼로그 — 표(검수)와 그리드(공개 카드)가 공유.
export function CardEditDialog({
  card,
  teams,
  members,
  series,
  onClose,
}: {
  card: Card;
  teams: TeamOption[];
  members: MemberOption[];
  series: SeriesOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [teamId, setTeamId] = useState<number | null>(card.teamId);
  const [memberId, setMemberId] = useState<number | null>(card.memberId);
  const [seriesId, setSeriesId] = useState<number | null>(card.seriesId);

  const teamMembers =
    teamId === null ? [] : members.filter((m) => m.teamIds.includes(teamId));
  const teamSeries =
    teamId === null ? [] : series.filter((s) => s.teamId === teamId);
  const memberName = members.find((m) => m.id === memberId)?.name;
  const seriesLabel = series.find((s) => s.id === seriesId)?.label;

  function save() {
    if (teamId === null || memberId === null || seriesId === null) {
      toast.error("그룹·멤버·시리즈를 모두 선택해주세요");
      return;
    }
    startTransition(async () => {
      const result = await updateCard(card.id, {
        itemType: card.itemType,
        teamId,
        memberId,
        seriesId,
        frontR2Key: null, // 이미지 유지
        itemCode: card.itemCode ?? undefined,
        retailPriceJpy: card.retailPriceJpy,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("수정했어요 — 이름도 규칙대로 갱신됐어요");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>카드 수정 — #{card.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">그룹</label>
            <Select
              value={teamId === null ? "" : String(teamId)}
              onValueChange={(v) => {
                setTeamId(Number(v));
                setMemberId(null);
                setSeriesId(null);
              }}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="그룹 선택" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">멤버</label>
              <Select
                value={memberId === null ? "" : String(memberId)}
                onValueChange={(v) => setMemberId(Number(v))}
                disabled={teamId === null}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="멤버" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">시리즈</label>
              <Select
                value={seriesId === null ? "" : String(seriesId)}
                onValueChange={(v) => setSeriesId(Number(v))}
                disabled={teamId === null}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="시리즈" />
                </SelectTrigger>
                <SelectContent>
                  {teamSeries.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">
              카드 이름 (자동)
            </span>
            <p className="font-medium text-foreground">
              {memberName && seriesLabel
                ? `${memberName} · ${seriesLabel}`
                : card.name}
            </p>
          </div>
          {card.status === "pending" && (
            <p className="text-xs text-muted-foreground">
              저장 후 목록에서 승인하면 공개돼요.
            </p>
          )}
          <Button className="w-full" disabled={pending} onClick={save}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
