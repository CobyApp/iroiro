import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { TeamsTable } from "@/modules/teams/components/TeamsTable";

export default async function AdminTeamsPage() {
  const teams = await listTeams();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">그룹</h2>
        <Button asChild>
          <Link href="/admin/teams/new">
            <Plus className="mr-0.5 h-4 w-4" />
            신규 그룹
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <TeamsTable teams={teams} />
      </div>
    </div>
  );
}
