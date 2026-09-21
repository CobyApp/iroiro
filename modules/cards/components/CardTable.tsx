"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Sparkles, Trash2, X } from "lucide-react";
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
  reviewCard,
  updateCard,
} from "../actions";
import {
  CARD_STATUS_LABEL,
  cardFrontUrl,
  type Card,
} from "../types";
import type {
  MemberOption,
  SeriesOption,
  TeamOption,
} from "./CardForm";
import { CardSimilarPanel } from "./CardSimilarPanel";

// 관리자 토레카 표 — 검수 대기 카드를 한 장씩(수정·승인·반려) 또는
// 여러 장 선택해 한 번에 승인할 수 있다.
export function CardTable({
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Card | null>(null);
  const [noteById, setNoteById] = useState<Record<number, string>>({});
  // 검수 보조 — 보류 카드의 기존·유사 카드를 AI로 확인하는 다이얼로그 대상.
  const [similarFor, setSimilarFor] = useState<Card | null>(null);

  const teamById = new Map(teams.map((t) => [t.id, t.name]));
  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const seriesById = new Map(series.map((s) => [s.id, s.label]));
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

  return (
    <>
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
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead className="w-16">앞면</TableHead>
            <TableHead>카드 이름</TableHead>
            <TableHead>멤버 / 시리즈</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="w-48 text-right">
              <span className="sr-only">작업</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((card) => {
            const frontUrl = cardFrontUrl(card, publicBaseUrl);
            const isPending = card.status === "pending";
            return (
              <TableRow key={card.id}>
                <TableCell>
                  {isPending && (
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(card.id)) next.delete(card.id);
                          else next.add(card.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 cursor-pointer accent-primary align-middle"
                      aria-label={`${card.name} 선택`}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {card.id}
                </TableCell>
                <TableCell>
                  <div className="h-14 w-10 overflow-hidden rounded-xs border border-border bg-muted">
                    {frontUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={frontUrl}
                        alt={card.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
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
                  {card.memberId !== null
                    ? (memberById.get(card.memberId) ?? "-")
                    : card.teamId !== null
                      ? teamById.get(card.teamId)
                      : "-"}
                  {card.seriesId !== null && (
                    <p className="text-xs text-muted-foreground">
                      {seriesById.get(card.seriesId) ?? "-"}
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        포즈 {card.pose}
                      </span>
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {card.status !== "active" ? (
                    <Badge
                      className={
                        isPending
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
                  )}
                </TableCell>
                <TableCell>
                  {isPending ? (
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <input
                        value={noteById[card.id] ?? ""}
                        onChange={(e) =>
                          setNoteById((prev) => ({
                            ...prev,
                            [card.id]: e.target.value,
                          }))
                        }
                        placeholder="반려 사유"
                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
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
                        className="h-8 w-8 p-0"
                        aria-label={`${card.name} 수정`}
                        disabled={pending}
                        onClick={() => setEditing(card)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => reviewCard(card.id, "approve"),
                            "승인 — 공개됐어요",
                          )
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 px-2 text-xs"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              reviewCard(
                                card.id,
                                "reject",
                                noteById[card.id],
                              ),
                            "반려했어요",
                          )
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                        반려
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label={`${card.name} 수정`}
                        disabled={pending}
                        onClick={() => setEditing(card)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label={`${card.name} 삭제`}
                        disabled={pending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `「${card.name}」 카드를 삭제할까요?`,
                            )
                          )
                            return;
                          run(() => deleteCard(card.id), "삭제했어요");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* 일괄 승인 바 — 검수 대기 카드를 여러 장 선택했을 때 */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-elevated">
            <span className="text-sm font-bold">{selected.size}장 선택</span>
            <Button size="sm" disabled={pending} onClick={bulkApprove}>
              {pending ? "승인 중…" : "한 번에 승인"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
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
              publicBaseUrl={publicBaseUrl}
            />
          </DialogContent>
        </Dialog>
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

function CardEditDialog({
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
