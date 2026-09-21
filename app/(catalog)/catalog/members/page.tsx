import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { MembersTable } from "@/modules/members/components/MembersTable";

export default async function AdminMembersPage() {
  const [members, teams] = await Promise.all([listMembers(), listTeams()]);
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">멤버</h2>
        <Button asChild>
          <Link href="/catalog/members/new">
            <Plus className="mr-0.5 h-4 w-4" />
            신규 멤버
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <MembersTable members={members} teamNameById={teamNameById} />
      </div>
    </div>
  );
}
