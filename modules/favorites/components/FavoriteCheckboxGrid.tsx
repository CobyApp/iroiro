// 서버 폼(FormData)용 최애 선택 — 네이티브 체크박스를 필 칩으로 스타일링.
// 회원가입처럼 클라이언트 JS 없이 동작해야 하는 화면에서 사용한다.
// 제출 값: favTeam=<id> / favMember=<id> (복수).
// 멤버는 그룹별 섹션으로 나눠 보여주고, 다중 소속 멤버는 대표 그룹 아래 한 번만 둔다(lib/group-members).

import {
  groupMembersByTeam,
  type FavoriteMemberItem,
  type FavoriteTeamItem,
} from "../lib/group-members";

function ChipCheckbox({
  name,
  value,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  value: number;
  label: string;
  /** 다중 소속 멤버의 다른 그룹명 — 작게 덧붙인다. */
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
        {label}
        {hint && (
          <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

export function FavoriteCheckboxGrid({
  teams,
  members,
  defaultTeamIds = [],
  defaultMemberIds = [],
}: {
  teams: FavoriteTeamItem[];
  members: FavoriteMemberItem[];
  defaultTeamIds?: number[];
  defaultMemberIds?: number[];
}) {
  if (teams.length === 0 && members.length === 0) return null;
  const groups = groupMembersByTeam(teams, members);

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
              <ChipCheckbox
                key={team.id}
                name="favTeam"
                value={team.id}
                label={team.name}
                defaultChecked={defaultTeamIds.includes(team.id)}
              />
            ))}
          </div>
        </div>
      )}
      {groups.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            최애 멤버{" "}
            <span className="font-normal text-muted-foreground">(복수 선택)</span>
          </p>
          {groups.map((group) => (
            <div key={group.team?.id ?? "etc"} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {group.team?.name ?? "기타"}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.members.map((member) => (
                  <ChipCheckbox
                    key={member.id}
                    name="favMember"
                    value={member.id}
                    label={member.name}
                    hint={
                      member.otherTeamNames.length > 0
                        ? `+ ${member.otherTeamNames.join(" · ")}`
                        : undefined
                    }
                    defaultChecked={defaultMemberIds.includes(member.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
