"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
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
  submitCardReport,
  type CardInput,
} from "../actions";
import { cardImageSrc, type Card, type CardImageView } from "../types";
import {
  SERIES_KIND_OPTIONS,
  seriesKindLabel,
  sortSeriesKinds,
} from "@/modules/series/kinds";
import { CardPhotoInput, type UploadedCardPhoto } from "./CardPhotoInput";
import { CardSimilarPanel } from "./CardSimilarPanel";

export type TeamOption = { id: number; name: string };
export type MemberOption = { id: number; name: string; teamIds: number[] };
export type SeriesOption = {
  id: number;
  teamId: number | null;
  label: string;
  kind: string;
};


const NEW_SERIES_VALUE = "__new__";

// 토레카 등록 폼 — 관리자(즉시 공개)와 유저 제보(검수 대기) 공용.
// 분석기와 같은 흐름: 그룹 → 멤버 → 시리즈(없으면 바로 추가), 카드 이름은
// "멤버 · 시리즈"로 자동 생성. 선택이 끝나면 기존 카드를 먼저 보여줘 중복을 줄인다.
export function CardForm({
  mode,
  teams,
  members,
  series,
  imageView,
}: {
  mode: "admin" | "user";
  teams: TeamOption[];
  members: MemberOption[];
  series: SeriesOption[];
  imageView: CardImageView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [teamId, setTeamId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<number | null>(null);
  // 인라인으로 추가한 시리즈 — 서버 새로고침 없이 목록에 합류.
  const [extraSeries, setExtraSeries] = useState<SeriesOption[]>([]);
  const [newSeriesOpen, setNewSeriesOpen] = useState(false);
  const [newSeriesLabel, setNewSeriesLabel] = useState("");
  const [newSeriesKind, setNewSeriesKind] = useState("random");
  const [front, setFront] = useState<UploadedCardPhoto | null>(null);
  const [existing, setExisting] = useState<Card[]>([]);
  const [checkedExisting, setCheckedExisting] = useState(false);

  const allSeries = [...series, ...extraSeries];
  const teamMembers =
    teamId === null ? [] : members.filter((m) => m.teamIds.includes(teamId));
  // 종류 → 시리즈 2단계 — 시리즈가 많아져도 훑기 쉽게.
  const teamKinds =
    teamId === null
      ? []
      : sortSeriesKinds([
          ...new Set(
            allSeries.filter((s) => s.teamId === teamId).map((s) => s.kind),
          ),
        ]);
  const teamSeries =
    teamId === null
      ? []
      : allSeries.filter(
          (s) => s.teamId === teamId && (kind === null || s.kind === kind),
        );

  const memberName = members.find((m) => m.id === memberId)?.name ?? null;
  const seriesLabel = allSeries.find((s) => s.id === seriesId)?.label ?? null;
  // 자동 생성될 카드 이름 미리보기 — 서버도 같은 규칙으로 저장한다.
  const autoName =
    memberName && seriesLabel ? `${memberName} · ${seriesLabel}` : null;

  function refreshExisting(nextSeriesId: number | null, nextMemberId: number | null) {
    setCheckedExisting(false);
    if (nextSeriesId === null && nextMemberId === null) {
      setExisting([]);
      return;
    }
    startTransition(async () => {
      const result = await fetchExistingCards(nextSeriesId, nextMemberId);
      if (result.ok) {
        setExisting(result.data);
        setCheckedExisting(true);
      }
    });
  }

  function addSeries() {
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
      const created: SeriesOption = {
        id: result.data.id,
        teamId,
        label: result.data.label,
        kind: result.data.kind,
      };
      if (!allSeries.some((s) => s.id === created.id)) {
        setExtraSeries((prev) => [...prev, created]);
      }
      // 새 시리즈의 종류로 필터를 맞춰 방금 만든 시리즈가 목록에 보이게.
      setKind(created.kind);
      setSeriesId(created.id);
      setNewSeriesOpen(false);
      setNewSeriesLabel("");
      toast.success(`시리즈 「${created.label}」 사용`);
      refreshExisting(created.id, memberId);
    });
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
        toast.success("토레카를 등록했어요");
        router.push("/catalog/cards");
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
                </SelectItem>
              ))}
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
              setNewSeriesKind(v || "random");
            }}
            disabled={teamId === null}
          >
            <SelectTrigger className={selectClass}>
              <SelectValue placeholder="종류 선택" />
            </SelectTrigger>
            <SelectContent>
              {teamKinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {seriesKindLabel(k)}
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
                setNewSeriesOpen(true);
                setSeriesId(null);
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
                </SelectItem>
              ))}
              {/* 분석기처럼 목록에 없으면 즉석 추가 */}
              <SelectItem value={NEW_SERIES_VALUE}>
                ＋ 목록에 없어요 — 새 시리즈 추가
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 새 시리즈 인라인 추가 */}
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
                {SERIES_KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="h-10 gap-1"
              disabled={pending || !newSeriesLabel.trim()}
              onClick={addSeries}
            >
              <Plus className="h-4 w-4" />
              추가
            </Button>
          </div>
        </div>
      )}

      {/* 중복 확인 — 이미 등록된 카드 */}
      {checkedExisting && existing.length > 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium text-foreground">
            이미 등록된 토레카 {existing.length}장
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            같은 카드가 아래에 있다면 새로 등록하지 않아도 돼요.
          </p>
          <HScroll className="scroll-x mt-2 flex gap-2 overflow-x-auto pb-1">
            {existing.map((card) => {
              const url = cardImageSrc(card, imageView);
              return (
                <figure key={card.id} className="w-20 shrink-0">
                  <div className="aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted">
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={card.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <figcaption className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                    포즈 {card.pose} · {card.name}
                  </figcaption>
                </figure>
              );
            })}
          </HScroll>
        </div>
      )}
      {checkedExisting && existing.length === 0 && (
        <p className="text-xs text-muted-foreground">
          이 조건으로 등록된 카드가 아직 없어요 — 첫 등록이에요!
        </p>
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
        </p>
      </div>

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
    </div>
  );
}
