"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveFavorites } from "../actions";
import {
  groupMembersByTeam,
  type FavoriteMemberItem,
  type FavoriteTeamItem,
} from "../lib/group-members";

// 회원정보 화면의 최애 편집 — 칩 토글 + 저장.
// 멤버는 그룹별 섹션으로 나눠 보여주고, 다중 소속 멤버는 대표 그룹 아래 한 번만 둔다(lib/group-members).

function toggle(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

function Chip({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  /** 다중 소속 멤버의 다른 그룹명 — 작게 덧붙인다. */
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-border bg-card text-foreground hover:bg-muted/50",
      )}
    >
      {label}
      {hint && (
        <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

export function FavoritesForm({
  teams,
  members,
  initialTeamIds,
  initialMemberIds,
}: {
  teams: FavoriteTeamItem[];
  members: FavoriteMemberItem[];
  initialTeamIds: number[];
  initialMemberIds: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [teamIds, setTeamIds] = useState<number[]>(initialTeamIds);
  const [memberIds, setMemberIds] = useState<number[]>(initialMemberIds);
  const groups = groupMembersByTeam(teams, members);

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
      // 저장 후 이전 화면으로 — 히스토리가 없으면(직접 진입) 마이페이지로.
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/mypage");
      }
    });
  }

  return (
    <div className="space-y-5">
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
      {groups.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            최애 멤버{" "}
            <span className="font-normal text-muted-foreground">
              (복수 선택 · {memberIds.length}명)
            </span>
          </p>
          {groups.map((group) => (
            <div key={group.team?.id ?? "etc"} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {group.team?.name ?? "기타"}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.members.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name}
                    hint={
                      member.otherTeamNames.length > 0
                        ? `+ ${member.otherTeamNames.join(" · ")}`
                        : undefined
                    }
                    selected={memberIds.includes(member.id)}
                    onClick={() => setMemberIds((prev) => toggle(prev, member.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Button onClick={onSave} disabled={pending || !dirty}>
        {pending ? "저장 중…" : "최애 저장"}
      </Button>
    </div>
  );
}
