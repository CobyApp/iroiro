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

export default async function CatalogMembersPage() {
  const [members, teams] = await Promise.all([listMembers(), listTeams()]);
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const missingHira = members.filter((m) => !m.nameI18n?.["ja-hira"]).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="MEMBERS"
        title="멤버"
        count={members.length}
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
          <Link href="/catalog/members/new">
            <Plus className="h-4 w-4" />
            신규 멤버
          </Link>
        </Button>
      </AdminPageHeader>

      <MembersTable members={members} teamNameById={teamNameById} />
    </div>
  );
}
