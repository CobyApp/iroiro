import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { TeamsTable } from "@/modules/teams/components/TeamsTable";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export const metadata: Metadata = { title: "그룹" };

export default async function CatalogTeamsPage() {
  const teams = await listTeams();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="GROUPS"
        title="그룹"
        count={teams.length}
        description="표시 순서(데뷔 순, CUTIE STREET 예외)와 고유색은 카탈로그·고객 화면의 정렬과 칩 색에 쓰여요."
      >
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/catalog/teams/new">
            <Plus className="h-4 w-4" />
            신규 그룹
          </Link>
        </Button>
      </AdminPageHeader>

      <TeamsTable teams={teams} />
    </div>
  );
}
