"use client";

import { useState, useTransition } from "react";
import { CalendarClock, LinkIcon, MapPin, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HScroll } from "@/components/HScroll";
import { fetchExistingCards } from "@/modules/cards/actions";
import { cardFrontUrl, type Card } from "@/modules/cards/types";
import { POST_LINK_LABEL_MAX, POST_PLACE_MAX } from "../lib/schema";
import type { PostTopic } from "../types";

export type TeamOpt = { id: number; name: string };
export type MemberOpt = { id: number; name: string; teamIds: number[] };

// 게시글 메타 값 — 최애 태그·토레카·링크·이벤트. datetime은 datetime-local 문자열로 보관.
export type PostMetaValue = {
  teamId: number | null;
  memberId: number | null;
  cardId: number | null;
  card: { id: number; name: string; imageUrl: string | null } | null;
  linkUrl: string;
  linkLabel: string;
  eventStartsAt: string;
  eventEndsAt: string;
  eventPlace: string;
};

export const EMPTY_META: PostMetaValue = {
  teamId: null,
  memberId: null,
  cardId: null,
  card: null,
  linkUrl: "",
  linkLabel: "",
  eventStartsAt: "",
  eventEndsAt: "",
  eventPlace: "",
};

export function PostMetaFields({
  topic,
  value,
  onChange,
  teams,
  members,
  publicBaseUrl,
  disabled = false,
}: {
  topic: PostTopic;
  value: PostMetaValue;
  onChange: (next: PostMetaValue) => void;
  teams: TeamOpt[];
  members: MemberOpt[];
  publicBaseUrl: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState<Card[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const set = (patch: Partial<PostMetaValue>) => onChange({ ...value, ...patch });
  const teamMembers =
    value.teamId === null ? [] : members.filter((m) => m.teamIds.includes(value.teamId!));

  function openCardPicker() {
    if (value.memberId === null) {
      toast.error("먼저 멤버를 골라주세요");
      return;
    }
    setPickerOpen(true);
    startTransition(async () => {
      const result = await fetchExistingCards(null, value.memberId);
      if (result.ok) setCards(result.data);
      else toast.error(result.message);
    });
  }

  return (
    <div className="space-y-4">
      {/* 이벤트 구조화 필드 — event 토픽에서만. */}
      {topic === "event" && (
        <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            이벤트 정보
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="eventStartsAt" className="text-xs">
                시작 일시 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="eventStartsAt"
                type="datetime-local"
                value={value.eventStartsAt}
                onChange={(e) => set({ eventStartsAt: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eventEndsAt" className="text-xs">
                종료 일시 (선택)
              </Label>
              <Input
                id="eventEndsAt"
                type="datetime-local"
                value={value.eventEndsAt}
                onChange={(e) => set({ eventEndsAt: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="eventPlace" className="flex items-center gap-1 text-xs">
              <MapPin className="h-3.5 w-3.5" /> 장소 (선택)
            </Label>
            <Input
              id="eventPlace"
              value={value.eventPlace}
              onChange={(e) => set({ eventPlace: e.target.value })}
              placeholder="예: 홍대 OO카페 / 온라인"
              maxLength={POST_PLACE_MAX}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* 최애 태그 — 그룹/멤버(선택). 멤버를 고르면 토레카 첨부가 열린다. */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1 text-sm">
          <Sparkles className="h-4 w-4 text-primary" /> 최애 태그 (선택)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={value.teamId !== null ? String(value.teamId) : "__none__"}
            onValueChange={(v) =>
              set({
                teamId: v === "__none__" ? null : Number(v),
                memberId: null,
                cardId: null,
                card: null,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="그룹" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">그룹 없음</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={value.memberId !== null ? String(value.memberId) : "__none__"}
            onValueChange={(v) =>
              set({
                memberId: v === "__none__" ? null : Number(v),
                cardId: null,
                card: null,
              })
            }
            disabled={disabled || value.teamId === null}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="멤버" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">멤버 없음</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 토레카 첨부 — 선택한 멤버의 카드에서 고른다(선택). */}
      <div className="space-y-2">
        <Label className="text-sm">토레카 첨부 (선택)</Label>
        {value.card ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
            <div className="h-14 w-10 overflow-hidden rounded-xs border border-border bg-muted">
              {value.card.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value.card.imageUrl}
                  alt={value.card.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm">{value.card.name}</span>
            <button
              type="button"
              onClick={() => set({ cardId: null, card: null })}
              className="rounded-full p-1 text-muted-foreground hover:text-destructive"
              aria-label="토레카 첨부 해제"
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : pickerOpen ? (
          <div className="rounded-md border border-border bg-card p-2">
            {pending ? (
              <p className="py-3 text-center text-xs text-muted-foreground">불러오는 중…</p>
            ) : cards.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                이 멤버로 등록된 토레카가 없어요.
              </p>
            ) : (
              <HScroll className="scroll-x flex gap-2 overflow-x-auto pb-1">
                {cards.map((card) => {
                  const url = cardFrontUrl(card, publicBaseUrl);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() =>
                        set({
                          cardId: card.id,
                          card: { id: card.id, name: card.name, imageUrl: url },
                        })
                      }
                      className="w-20 shrink-0 text-left"
                    >
                      <span className="block aspect-[63/88] overflow-hidden rounded-sm border border-border bg-muted">
                        {url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={card.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[10px] leading-tight text-muted-foreground">
                        {card.name}
                      </span>
                    </button>
                  );
                })}
              </HScroll>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openCardPicker}
            disabled={disabled || value.memberId === null}
            className="w-full rounded-md border border-dashed border-border py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            {value.memberId === null
              ? "멤버를 고르면 이 멤버의 토레카를 붙일 수 있어요"
              : "＋ 이 멤버의 토레카 붙이기"}
          </button>
        )}
      </div>

      {/* 링크 첨부 — 전 게시판 공통(예약·공지 등). */}
      <div className="space-y-2">
        <Label htmlFor="linkUrl" className="flex items-center gap-1 text-sm">
          <LinkIcon className="h-4 w-4 text-primary" /> 링크 첨부 (선택)
        </Label>
        <Input
          id="linkUrl"
          type="url"
          inputMode="url"
          value={value.linkUrl}
          onChange={(e) => set({ linkUrl: e.target.value })}
          placeholder="https:// 예약·공지 링크"
          disabled={disabled}
        />
        {value.linkUrl.trim() !== "" && (
          <Input
            value={value.linkLabel}
            onChange={(e) => set({ linkLabel: e.target.value })}
            placeholder="링크 이름 (선택 — 예: 예약 폼)"
            maxLength={POST_LINK_LABEL_MAX}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

// datetime-local ↔ ISO 변환 헬퍼(폼 제출·프리필 공용).
export function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // 로컬 타임존 기준 datetime-local 값(YYYY-MM-DDTHH:mm).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
