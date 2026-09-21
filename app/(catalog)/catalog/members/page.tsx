import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { MembersTable } from "@/modules/members/components/MembersTable";
import { CatalogPageHeader } from "@/modules/admin/components/CatalogPageHeader";

export const metadata: Metadata = { title: "멤버" };

export default async function CatalogMembersPage() {
  const [members, teams] = await Promise.all([listMembers(), listTeams()]);
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const missingHira = members.filter((m) => !m.nameI18n?.["ja-hira"]).length;

  return (
    <div className="space-y-5">
      <CatalogPageHeader
        title="멤버"
        count={members.length}
        description={
          <>
            그룹별 공식 순번·역할·표기를 관리해요.
            {missingHira > 0 && (
              <span className="ml-1 text-amber-700">히라가나 표기 미입력 {missingHira}명</span>
            )}
          </>
        }
      >
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/catalog/members/new">
            <Plus className="h-4 w-4" />
            신규 멤버
          </Link>
        </Button>
      </CatalogPageHeader>

      <div className="overflow-hidden rounded-md border border-border bg-card shadow-card">
        <MembersTable members={members} teamNameById={teamNameById} />
      </div>
    </div>
  );
}
