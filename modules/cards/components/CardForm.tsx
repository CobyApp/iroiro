"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HScroll } from "@/components/HScroll";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCardAdmin,
  createSeriesInline,
  fetchExistingCards,
  fetchRegistrationHint,
  submitCardReport,
  type CardInput,
} from "../actions";
import type { RegistrationHint } from "../lib/queries";
import { cardImageSrc, type Card, type CardImageView } from "../types";
import {
  kindLabelOf,
  kindSelectOptions,
  sortKindKeys,
  type KindOption,
} from "@/modules/series/lib/kind-options";
import { MemberQuickAddDialog } from "@/modules/members/components/MemberQuickAddDialog";
import { SeriesQuickAddDialog } from "@/modules/series/components/SeriesQuickAddDialog";
import { CardPhotoInput, type UploadedCardPhoto } from "./CardPhotoInput";
import { CardSimilarPanel } from "./CardSimilarPanel";

export type TeamOption = { id: number; name: string };
export type MemberOption = {
  id: number;
  name: string;
  teamIds: number[];
  /** 일본어 표기 — 카드 상세·선택지 보조 표기. */
  nameJa?: string | null;
};
export type SeriesOption = {
  id: number;
  teamId: number | null;
  label: string;
  kind: string;
  /** 카드 상세 표시용 — 유저 제보 화면은 넘기지 않는다. */
  sku?: string;
};

/** URL(?team=&member=&series=) 등으로 미리 고른 값 — 커버리지 매트릭스의 빈 셀에서 넘어올 때. */
export type CardFormInitial = {
  teamId?: number | null;
  memberId?: number | null;
  seriesId?: number | null;
};

const NEW_SERIES_VALUE = "__new__";
const NEW_MEMBER_VALUE = "__new_member__";

// 토레카 등록 폼 — 관리자(즉시 공개)와 유저 제보(검수 대기) 공용.
// 분석기와 같은 흐름: 그룹 → 멤버 → 시리즈(없으면 바로 추가), 카드 이름은
// "멤버 · 시리즈"로 자동 생성. 선택이 끝나면 기존 카드를 먼저 보여줘 중복을 줄인다.
// 종류 라벨·순서·선택지는 DB(series_kind)에서 내려온 kinds 로 그린다 — /catalog/kinds 편집이 그대로 반영.
// 관리자 모드는 폼을 떠나지 않고 멤버·시리즈를 추가할 수 있고(빠른 추가 다이얼로그), 저장 후에도
// 그룹·멤버·시리즈를 유지하는 연속 등록이 기본이다.
export function CardForm({
  mode,
  teams,
  members,
  series,
  kinds,
  imageView,
  initial,
}: {
  mode: "admin" | "user";
  teams: TeamOption[];
  members: MemberOption[];
  series: SeriesOption[];
  kinds: KindOption[];
  imageView: CardImageView;
  initial?: CardFormInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const kindOptions = kindSelectOptions(kinds);
  const defaultKind = kindOptions[0]?.key ?? "random";

  // 미리 고른 값 검증 — 그룹에 없는 멤버·시리즈는 무시한다(잘못된 링크로 엉뚱한 카드가 만들어지지 않게).
  const initialTeam = teams.find((t) => t.id === initial?.teamId)?.id ?? null;
  const initialMember =
    initialTeam !== null
      ? (members.find((m) => m.id === initial?.memberId && m.teamIds.includes(initialTeam))?.id ?? null)
      : null;
  const initialSeries =
    initialTeam !== null
      ? (series.find((s) => s.id === initial?.seriesId && s.teamId === initialTeam) ?? null)
      : null;

  const [teamId, setTeamId] = useState<number | null>(initialTeam);
  const [memberId, setMemberId] = useState<number | null>(initialMember);
  const [kind, setKind] = useState<string | null>(initialSeries?.kind ?? null);
  const [seriesId, setSeriesId] = useState<number | null>(initialSeries?.id ?? null);
  // 인라인·다이얼로그로 추가한 멤버·시리즈 — 서버 새로고침 없이 목록에 합류.
  const [extraMembers, setExtraMembers] = useState<MemberOption[]>([]);
  const [extraSeries, setExtraSeries] = useState<SeriesOption[]>([]);
  // 유저 모드 — 인라인 새 시리즈(find-or-create). 관리자 모드는 다이얼로그를 쓴다.
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);
  const [newSeriesLabel, setNewSeriesLabel] = useState("");
  const [newSeriesKind, setNewSeriesKind] = useState(defaultKind);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [front, setFront] = useState<UploadedCardPhoto | null>(null);
  const [existing, setExisting] = useState<Card[]>([]);
  const [checkedExisting, setCheckedExisting] = useState(false);
  const [hint, setHint] = useState<RegistrationHint | null>(null);
  // 연속 등록 — 저장 후 그룹·멤버·시리즈·종류를 유지하고 사진만 비운다.
  const [continuous, setContinuous] = useState(true);

  const allMembers = [...members, ...extraMembers];
  const allSeries = [...series, ...extraSeries];
  const teamName = teams.find((t) => t.id === teamId)?.name;
  const teamMembers =
    teamId === null ? [] : allMembers.filter((m) => m.teamIds.includes(teamId));
  // 종류 → 시리즈 2단계 — 시리즈가 많아져도 훑기 쉽게.
  const teamKinds =
    teamId === null
      ? []
      : sortKindKeys(
          [...new Set(allSeries.filter((s) => s.teamId === teamId).map((s) => s.kind))],
          kinds,
        );
  const teamSeries =
    teamId === null
      ? []
      : allSeries.filter(
          (s) => s.teamId === teamId && (kind === null || s.kind === kind),
        );

  const memberName = allMembers.find((m) => m.id === memberId)?.name ?? null;
  const selectedSeries = allSeries.find((s) => s.id === seriesId) ?? null;
  const seriesLabel = selectedSeries?.label ?? null;
  // 자동 생성될 카드 이름 미리보기 — 서버도 같은 규칙으로 저장한다.
  const autoName =
    memberName && seriesLabel ? `${memberName} · ${seriesLabel}` : null;

  function refreshExisting(nextSeriesId: number | null, nextMemberId: number | null) {
    setCheckedExisting(false);
    setHint(null);
    if (nextSeriesId === null && nextMemberId === null) {
      setExisting([]);
      return;
    }
    startTransition(async () => {
      const [cards, nextHint] = await Promise.all([
        fetchExistingCards(nextSeriesId, nextMemberId),
        mode === "admin" && nextSeriesId !== null && nextMemberId !== null
          ? fetchRegistrationHint({ memberId: nextMemberId, seriesId: nextSeriesId })
          : Promise.resolve(null),
      ]);
      if (cards.ok) {
        setExisting(cards.data);
        setCheckedExisting(true);
      }
      if (nextHint?.ok) setHint(nextHint.data);
    });
  }

  // URL 로 미리 고른 멤버·시리즈가 있으면 첫 화면부터 기존 카드·힌트를 보여준다.
  useEffect(() => {
    if (initialMember === null && initialSeries === null) return;
    let alive = true;
    const seriesIdAtMount = initialSeries?.id ?? null;
    (async () => {
      const [cards, nextHint] = await Promise.all([
        fetchExistingCards(seriesIdAtMount, initialMember),
        mode === "admin" && seriesIdAtMount !== null && initialMember !== null
          ? fetchRegistrationHint({ memberId: initialMember, seriesId: seriesIdAtMount })
          : Promise.resolve(null),
      ]);
      if (!alive) return;
      if (cards.ok) {
        setExisting(cards.data);
        setCheckedExisting(true);
      }
      if (nextHint?.ok) setHint(nextHint.data);
    })();
    return () => {
      alive = false;
    };
    // initial* 은 props 에서 한 번 계산되는 값 — 마운트 시 한 번만.
  }, [initialMember, initialSeries, mode]);

  // 유저 모드 — 목록에 없는 시리즈를 인라인으로 추가(find-or-create).
  function addSeriesInline() {
    if (teamId === null || !newSeriesLabel.trim()) return;
    startTransition(async () => {
      const result = await createSeriesInline(
        teamId,
        newSeriesLabel,
        newSeriesKind,
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      selectCreatedSeries({
        id: result.data.id,
        teamId,
        label: result.data.label,
        kind: result.data.kind,
      });
      setNewSeriesOpen(false);
      setNewSeriesLabel("");
      toast.success(`시리즈 「${result.data.label}」 사용`);
    });
  }

  // 새 시리즈를 목록에 넣고 바로 선택 — 종류 필터도 새 시리즈의 종류로 맞춰 목록에 보이게.
  function selectCreatedSeries(created: SeriesOption) {
    if (!allSeries.some((s) => s.id === created.id)) {
      setExtraSeries((prev) => [...prev, created]);
    }
    setKind(created.kind);
    setSeriesId(created.id);
    refreshExisting(created.id, memberId);
  }

  function submit() {
    if (teamId === null || memberId === null || seriesId === null || !front) {
      toast.error("그룹·멤버·시리즈와 앞면 이미지를 채워주세요");
      return;
    }
    const input: CardInput = {
      itemType: "photocard",
      teamId,
      memberId,
      seriesId,
      frontR2Key: front.r2Key,
    };
    startTransition(async () => {
      const result =
        mode === "admin"
          ? await createCardAdmin(input)
          : await submitCardReport(input);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (mode === "admin") {
        if (!continuous) {
          toast.success("토레카를 등록했어요");
          router.push("/catalog/cards");
          return;
        }
        // 연속 등록 — 선택은 유지, 사진만 비우고 기존 카드·다음 포즈를 갱신한다.
        const viewUrl = `/catalog/cards?team=${teamId}&member=${memberId}&series=${seriesId}#card-${result.data.id}`;
        toast.success(
          `#${result.data.id} 등록 — ${autoName ?? "토레카"}${hint ? ` · 포즈 ${hint.nextPose}` : ""}`,
          { action: { label: "카드 보기", onClick: () => router.push(viewUrl) } },
        );
        setFront(null);
        refreshExisting(seriesId, memberId);
      } else {
        toast.success("제보 완료! 승인되면 100P가 적립돼요");
        router.refresh();
        setFront(null);
        setSeriesId(null);
        setExisting([]);
        setCheckedExisting(false);
      }
    });
  }

  const selectClass = "h-10 w-full";
  const kindBadge = (k: string) => (
    <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
      {kindLabelOf(kinds, k)}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* 그룹 → 멤버 → 종류 → 시리즈 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">그룹</label>
          <Select
            value={teamId === null ? "" : String(teamId)}
            onValueChange={(v) => {
              const next = Number(v);
              setTeamId(next);
              setMemberId(null);
              setKind(null);
              setSeriesId(null);
              setNewSeriesOpen(false);
              setExisting([]);
              setCheckedExisting(false);
              setHint(null);
            }}
          >
            <SelectTrigger className={selectClass}>
              <SelectValue placeholder="그룹 선택" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={String(team.id)}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">멤버</label>
          <Select
            value={memberId === null ? "" : String(memberId)}
            onValueChange={(v) => {
              if (v === NEW_MEMBER_VALUE) {
                setMemberDialogOpen(true);
                return;
              }
              const next = Number(v);
              setMemberId(next);
              refreshExisting(seriesId, next);
            }}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectClass}>
              <SelectValue placeholder="멤버 선택" />
            </SelectTrigger>
            <SelectContent>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={String(member.id)}>
                  {member.name}
                  {member.nameJa && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{member.nameJa}</span>
                  )}
                </SelectItem>
              ))}
              {mode === "admin" && (
                <SelectItem value={NEW_MEMBER_VALUE} className="text-primary">
                  ＋ 목록에 없어요 — 새 멤버 추가
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">종류</label>
          <Select
            value={kind ?? ""}
            onValueChange={(v) => {
              setKind(v || null);
              setSeriesId(null);
              setNewSeriesOpen(false);
              setNewSeriesKind(v || defaultKind);
              setHint(null);
            }}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectClass}>
              <SelectValue placeholder="종류 (전체)" />
            </SelectTrigger>
            <SelectContent>
              {teamKinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {kindLabelOf(kinds, k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">시리즈</label>
          <Select
            value={
              newSeriesOpen
                ? NEW_SERIES_VALUE
                : seriesId === null
                  ? ""
                  : String(seriesId)
            }
            onValueChange={(v) => {
              if (v === NEW_SERIES_VALUE) {
                if (mode === "admin") {
                  setSeriesDialogOpen(true);
                } else {
                  setNewSeriesOpen(true);
                  setSeriesId(null);
                }
                return;
              }
              setNewSeriesOpen(false);
              const next = Number(v);
              setSeriesId(next);
              refreshExisting(next, memberId);
            }}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectClass}>
              <SelectValue placeholder="시리즈 선택" />
            </SelectTrigger>
            <SelectContent>
              {teamSeries.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.label}
                  {kindBadge(s.kind)}
                </SelectItem>
              ))}
              {/* 분석기처럼 목록에 없으면 즉석 추가 — 관리자는 SKU·URL 까지 받는 다이얼로그 */}
              <SelectItem value={NEW_SERIES_VALUE} className="text-primary">
                ＋ 목록에 없어요 — 새 시리즈 추가
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 관리자 — 빠른 추가 버튼(선택 상자 안의 항목과 같은 동작, 손가락으로 바로 누를 수 있게) */}
      {mode === "admin" && teamId !== null && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-primary"
            onClick={() => setMemberDialogOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {teamName} 멤버 추가
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-primary"
            onClick={() => setSeriesDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            시리즈 추가
          </Button>
        </div>
      )}

      {/* 유저 모드 — 새 시리즈 인라인 추가 */}
      {newSeriesOpen && (
        <div className="space-y-2 rounded-md border border-dashed border-primary/50 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">새 시리즈 추가</p>
            <button
              type="button"
              onClick={() => setNewSeriesOpen(false)}
              aria-label="새 시리즈 입력 닫기"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newSeriesLabel}
              onChange={(e) => setNewSeriesLabel(e.target.value)}
              placeholder="시리즈 이름 (예: クリスマス 2025)"
              className="h-10 flex-1"
            />
            <Select value={newSeriesKind} onValueChange={setNewSeriesKind}>
              <SelectTrigger className="h-10 w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((k) => (
                  <SelectItem key={k.key} value={k.key}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="h-10 gap-1"
              disabled={pending || !newSeriesLabel.trim()}
              onClick={addSeriesInline}
            >
              <Plus className="h-4 w-4" />
              추가
            </Button>
          </div>
        </div>
      )}

      {/* 등록 현황 + 중복 확인 — 이 멤버·시리즈에 이미 있는 카드(썸네일 + 포즈) */}
      {checkedExisting && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-medium text-foreground">
              {existing.length > 0
                ? `이미 등록된 토레카 ${existing.length}장`
                : "이 조건으로 등록된 카드가 아직 없어요 — 첫 등록이에요!"}
            </p>
            {hint && (
              <p className="catalog-stat text-xs text-muted-foreground">
                {seriesLabel ? "이 시리즈에 " : ""}등록된 카드 {hint.count}장 · 다음 포즈{" "}
                <b className="text-primary">#{hint.nextPose}</b>
              </p>
            )}
          </div>
          {existing.length > 0 && (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">
                같은 카드가 아래에 있다면 새로 등록하지 않아도 돼요.
              </p>
              <HScroll className="scroll-x mt-2 flex gap-2 overflow-x-auto pb-1">
                {existing.map((card) => {
                  const url = cardImageSrc(card, imageView);
                  return (
                    <figure key={card.id} className="w-16 shrink-0">
                      <div className="relative aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted">
                        {url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={card.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                        <span className="catalog-stat absolute left-0 top-0 rounded-br-sm bg-card/90 px-1 py-0.5 text-[10px] font-semibold text-foreground">
                          #{card.pose}
                        </span>
                      </div>
                      <figcaption className="mt-1 truncate text-[10px] leading-tight text-muted-foreground" title={card.name}>
                        {card.name}
                      </figcaption>
                    </figure>
                  );
                })}
              </HScroll>
            </>
          )}
        </div>
      )}

      {/* 앞면 이미지 — 토레카는 앞면만 보관한다 */}
      <div className="max-w-[11rem]">
        <CardPhotoInput label="앞면" required value={front} onChange={setFront} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        카드는 <b className="text-foreground">Google PhotoScan</b>으로 찍어주세요
        — 빛 반사 없이 평평하게 스캔되어 정확도가 올라가요. 올린 사진은 카드
        규격(63:88)으로 자동 잘리고 해상도 정리 후 워터마크가 들어갑니다.
      </p>

      {/* AI 유사 카드 — 관리자 등록에서만. 유저 제보는 AI 분석 없이 접수하고(위 "이미 등록된 카드"로
          중복만 안내), 분석·유사 비교는 카탈로그 검수 단계에서 관리자가 한다. */}
      {mode === "admin" && front && (
        <CardSimilarPanel
          frontR2Key={front.r2Key}
          teamId={teamId}
          memberId={memberId}
          imageView={imageView}
        />
      )}

      {/* 자동 생성 카드 이름 미리보기 */}
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
        <span className="text-xs text-muted-foreground">카드 이름 (자동)</span>
        <p className="font-medium text-foreground">
          {autoName ?? "멤버와 시리즈를 고르면 자동으로 만들어져요"}
          {autoName && hint && (
            <span className="catalog-stat ml-1.5 text-xs font-normal text-muted-foreground">
              포즈 #{hint.nextPose}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          size="lg"
          className="w-full sm:w-auto sm:px-10"
          disabled={
            pending ||
            teamId === null ||
            memberId === null ||
            seriesId === null ||
            !front
          }
          onClick={submit}
        >
          {pending
            ? "등록 중…"
            : mode === "admin"
              ? "토레카 등록"
              : "제보하기 (검수 후 공개)"}
        </Button>
        {mode === "admin" && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            연속 등록 — 저장 후 그룹·멤버·시리즈 유지
          </label>
        )}
      </div>

      {mode === "admin" && teamId !== null && (
        <>
          <MemberQuickAddDialog
            open={memberDialogOpen}
            onOpenChange={setMemberDialogOpen}
            teams={teams}
            defaultTeamId={teamId}
            lockTeam
            onCreated={(m) => {
              const created: MemberOption = {
                id: m.id,
                name: m.name,
                teamIds: m.teamIds,
                nameJa: m.nameI18n?.["ja-jpan"] ?? null,
              };
              setExtraMembers((prev) =>
                prev.some((x) => x.id === created.id) ? prev : [...prev, created],
              );
              setMemberId(created.id);
              refreshExisting(seriesId, created.id);
            }}
          />
          <SeriesQuickAddDialog
            open={seriesDialogOpen}
            onOpenChange={setSeriesDialogOpen}
            teamId={teamId}
            teamName={teamName}
            kinds={kindOptions}
            defaultKind={kind}
            onCreated={(s) =>
              selectCreatedSeries({
                id: s.id,
                teamId: s.teamId,
                label: s.labelKo && s.labelKo !== s.label ? `${s.label} (${s.labelKo})` : s.label,
                kind: s.kind,
                sku: s.sku,
              })
            }
          />
        </>
      )}
    </div>
  );
}
