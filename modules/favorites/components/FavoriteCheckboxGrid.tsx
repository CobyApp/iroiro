// 서버 폼(FormData)용 최애 선택 — 네이티브 체크박스를 필 칩으로 스타일링.
// 회원가입처럼 클라이언트 JS 없이 동작해야 하는 화면에서 사용한다.
// 제출 값: favTeam=<id> / favMember=<id> (복수).

type Item = { id: number; name: string };

function ChipCheckbox({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: number;
  label: string;
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
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
        ♡ {label}
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
  teams: Item[];
  members: Item[];
  defaultTeamIds?: number[];
  defaultMemberIds?: number[];
}) {
  if (teams.length === 0 && members.length === 0) return null;
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
      {members.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            최애 멤버{" "}
            <span className="font-normal text-muted-foreground">(복수 선택)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => (
              <ChipCheckbox
                key={member.id}
                name="favMember"
                value={member.id}
                label={member.name}
                defaultChecked={defaultMemberIds.includes(member.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
