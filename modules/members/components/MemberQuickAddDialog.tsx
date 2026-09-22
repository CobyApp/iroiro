"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LOCALE_KEYS,
  LOCALE_LABELS,
  LOCALE_PLACEHOLDERS,
  type LocaleKey,
  type NameI18n,
} from "@/lib/i18n";
import { quickCreateMember } from "../actions";
import type { MemberWithTeams } from "../types";

export type QuickAddTeamOption = { id: number; name: string };

// 멤버 빠른 추가 — 한글명·일본어·히라가나·영문 표기와 소속 그룹만 받는다(활동 시작일 오늘, 순번은 그룹 끝).
// 멤버 목록의 「빠른 추가」와 카드 등록 폼의 「새 멤버」가 공유. 데뷔일·역할 같은 세부는 편집 화면에서.
export function MemberQuickAddDialog({
  open,
  onOpenChange,
  teams,
  defaultTeamId = null,
  lockTeam = false,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: QuickAddTeamOption[];
  /** 미리 고를 그룹 — 등록 폼은 현재 선택한 그룹을 넘긴다. */
  defaultTeamId?: number | null;
  /** true 면 그룹을 바꿀 수 없다(등록 폼 — 지금 그룹에 추가하는 뜻이 분명하게). */
  lockTeam?: boolean;
  onCreated?: (member: MemberWithTeams) => void;
}) {
  const lockedTeamName = teams.find((t) => t.id === defaultTeamId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            멤버 빠른 추가
            {lockTeam && lockedTeamName ? ` — ${lockedTeamName}` : ""}
          </DialogTitle>
          <DialogDescription>
            표기와 소속 그룹만 넣으면 돼요. 데뷔일·역할·순번은 멤버 편집에서
            다듬을 수 있어요.
          </DialogDescription>
        </DialogHeader>
        {/* 폼 상태는 안쪽 컴포넌트에 — 다이얼로그가 닫히면 내용이 언마운트되어 다음에 열 때 비어 있다. */}
        <MemberQuickAddForm
          teams={teams}
          defaultTeamId={defaultTeamId}
          lockTeam={lockTeam}
          onDone={(member) => {
            onOpenChange(false);
            onCreated?.(member);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function MemberQuickAddForm({
  teams,
  defaultTeamId,
  lockTeam,
  onDone,
}: {
  teams: QuickAddTeamOption[];
  defaultTeamId: number | null;
  lockTeam: boolean;
  onDone: (member: MemberWithTeams) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<number | null>(defaultTeamId);
  const [i18n, setI18n] = useState<Record<LocaleKey, string>>({
    "ja-jpan": "",
    "ja-hira": "",
    en: "",
  });
  const teamName = teams.find((t) => t.id === teamId)?.name;

  function buildI18n(): NameI18n | null {
    const entries = LOCALE_KEYS.flatMap((key) => {
      const v = i18n[key].trim();
      return v ? [[key, v] as const] : [];
    });
    return entries.length > 0
      ? (Object.fromEntries(entries) as NameI18n)
      : null;
  }

  function submit() {
    if (!name.trim()) {
      toast.error("한글 멤버명은 필수입니다");
      return;
    }
    if (teamId === null) {
      toast.error("소속 그룹을 선택해주세요");
      return;
    }
    startTransition(async () => {
      const result = await quickCreateMember({
        name: name.trim(),
        nameI18n: buildI18n(),
        teamId,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`멤버 「${result.data.name}」 추가`);
      onDone(result.data);
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) submit();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="member-quick-name">
          한글명 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="member-quick-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 민지"
          autoFocus
          className="h-11 sm:h-10"
        />
      </div>
      {LOCALE_KEYS.map((key) => (
        <div className="space-y-1" key={key}>
          <Label htmlFor={`member-quick-${key}`}>{LOCALE_LABELS[key]}</Label>
          <Input
            id={`member-quick-${key}`}
            value={i18n[key]}
            onChange={(e) =>
              setI18n((prev) => ({ ...prev, [key]: e.target.value }))
            }
            placeholder={LOCALE_PLACEHOLDERS[key]}
            className="h-11 sm:h-10"
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor="member-quick-team">
          소속 그룹 <span className="text-destructive">*</span>
        </Label>
        {lockTeam ? (
          <p
            id="member-quick-team"
            className="flex h-11 items-center rounded-md border border-border bg-muted/50 px-3 text-sm sm:h-10"
          >
            {teamName ?? "-"}
          </p>
        ) : (
          <Select
            value={teamId === null ? "" : String(teamId)}
            onValueChange={(v) => setTeamId(Number(v))}
          >
            <SelectTrigger
              id="member-quick-team"
              className="h-11 w-full sm:h-10"
            >
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
        )}
      </div>
      <Button
        type="submit"
        className="h-11 w-full sm:h-10"
        disabled={pending || !name.trim() || teamId === null}
      >
        {pending ? "추가 중…" : "추가"}
      </Button>
    </form>
  );
}
