"use client";

import { useRouter, useSearchParams } from "next/navigation";

const KINDS = [
  { v: "", label: "전체 종류" },
  { v: "random", label: "정규" },
  { v: "costume", label: "의상" },
  { v: "event", label: "이벤트" },
  { v: "birthday", label: "생탄제" },
];

type Ref = { id: number; name: string };

const selectClass =
  "h-9 rounded-full border border-border bg-card pl-3.5 pr-2 text-sm shadow-card";

// 카드 가져오기 브라우즈 필터 — 그룹/멤버/종류 + 신규만. 변경 시 searchParam 갱신.
export function ImportFilters({
  teams,
  members,
}: {
  teams: Ref[];
  members: Ref[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const team = sp.get("team") ?? "";
  const member = sp.get("member") ?? "";
  const kind = sp.get("kind") ?? "";
  const hide = sp.get("hide") === "1";

  function nav(patch: Record<string, string>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    q.delete("offset"); // 필터 변경 시 페이지 초기화
    router.push(`/catalog/import?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={team}
        onChange={(e) => nav({ team: e.target.value })}
        className={selectClass}
        aria-label="그룹"
      >
        <option value="">전체 그룹</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={member}
        onChange={(e) => nav({ member: e.target.value })}
        className={selectClass}
        aria-label="멤버"
      >
        <option value="">전체 멤버</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        value={kind}
        onChange={(e) => nav({ kind: e.target.value })}
        className={selectClass}
        aria-label="종류"
      >
        {KINDS.map((k) => (
          <option key={k.v} value={k.v}>
            {k.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => nav({ hide: hide ? "" : "1" })}
        className={`rounded-full border border-border px-3.5 py-1.5 text-sm shadow-card transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
          hide ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
        }`}
      >
        {hide ? "✓ 신규만" : "신규만 보기"}
      </button>
    </div>
  );
}
