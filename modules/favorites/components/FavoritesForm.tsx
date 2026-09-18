"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveFavorites } from "../actions";

// 회원정보 화면의 최애 편집 — 칩 토글 + 저장.
type Item = { id: number; name: string };

function toggle(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-border bg-card text-foreground hover:bg-muted/50",
      )}
    >
      ♡ {label}
    </button>
  );
}

export function FavoritesForm({
  teams,
  members,
  initialTeamIds,
  initialMemberIds,
}: {
  teams: Item[];
  members: Item[];
  initialTeamIds: number[];
  initialMemberIds: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [teamIds, setTeamIds] = useState<number[]>(initialTeamIds);
  const [memberIds, setMemberIds] = useState<number[]>(initialMemberIds);

  const dirty =
    JSON.stringify([...teamIds].sort()) !==
      JSON.stringify([...initialTeamIds].sort()) ||
    JSON.stringify([...memberIds].sort()) !==
      JSON.stringify([...initialMemberIds].sort());

  function onSave() {
    startTransition(async () => {
      const result = await saveFavorites({ teamIds, memberIds });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("최애 정보를 저장했어요! 홈 추천에 반영됩니다.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {teams.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            좋아하는 그룹{" "}
            <span className="font-normal text-muted-foreground">(복수 선택)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {teams.map((team) => (
              <Chip
                key={team.id}
                label={team.name}
                selected={teamIds.includes(team.id)}
                onClick={() => setTeamIds((prev) => toggle(prev, team.id))}
              />
            ))}
          </div>
        </div>
      )}
      {members.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            최애 멤버{" "}
            <span className="font-normal text-muted-foreground">(복수 선택)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                selected={memberIds.includes(member.id)}
                onClick={() => setMemberIds((prev) => toggle(prev, member.id))}
              />
            ))}
          </div>
        </div>
      )}
      <Button onClick={onSave} disabled={pending || !dirty}>
        {pending ? "저장 중…" : "최애 저장"}
      </Button>
    </div>
  );
}
