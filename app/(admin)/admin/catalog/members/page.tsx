import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { MembersTable } from "@/modules/members/components/MembersTable";
import { MemberQuickAddButton } from "@/modules/members/components/MemberQuickAddButton";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export const metadata: Metadata = { title: "멤버" };

type SearchParams = Promise<{ team?: string }>;

// 멤버 — 그룹별로 나눠 본다. 기본은 첫 그룹만 노출해 스크롤을 줄이고, team=all 이면 전체(소속 미지정 포함).
export default async function CatalogMembersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const showAll = sp.team === "all";
  const explicitTeam = Number(sp.team) > 0 ? Number(sp.team) : undefined;

  const [members, teams] = await Promise.all([listMembers(), listTeams()]);
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  // 선택 그룹 결정: 명시 그룹 > (전체 아님이면) 첫 그룹. team=all 이면 전체.
  const teamFilter = explicitTeam ?? (showAll ? undefined : teams[0]?.id);

  const shown =
    teamFilter === undefined
      ? members
      : members.filter((m) => m.teamIds.includes(teamFilter));
  const missingHira = shown.filter((m) => !m.nameI18n?.["ja-hira"]).length;

  const chip = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="MEMBERS"
        title="멤버"
        count={shown.length}
        description={
          <>
            그룹별 공식 순번·역할·표기를 관리해요.
            {missingHira > 0 && (
              <span className="ml-1 font-medium text-primary">히라가나 표기 미입력 {missingHira}명</span>
            )}
          </>
        }
      >
        <MemberQuickAddButton teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
        <Button asChild size="sm" className="flex-1 gap-1.5 sm:flex-none">
          <Link href="/admin/catalog/members/new">
            <Plus className="h-4 w-4" />
            신규 멤버
          </Link>
        </Button>
      </AdminPageHeader>

      <div className="scroll-x scroll-x-fade flex gap-1.5 overflow-x-auto pb-1">
        <Link href="/admin/catalog/members?team=all" className={chip(showAll)}>
          모든 그룹
        </Link>
        {teams.map((t) => (
          <Link key={t.id} href={`/admin/catalog/members?team=${t.id}`} className={chip(teamFilter === t.id)}>
            {t.name}
            <span className="ml-1 tabular-nums text-muted-foreground">
              {members.filter((m) => m.teamIds.includes(t.id)).length}
            </span>
          </Link>
        ))}
      </div>

      <MembersTable members={shown} teamNameById={teamNameById} teamFilter={teamFilter} />
    </div>
  );
}
