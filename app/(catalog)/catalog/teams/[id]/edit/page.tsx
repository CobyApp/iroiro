import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamForm } from "@/modules/teams/components/TeamForm";
import { getTeamById } from "@/modules/teams/lib/queries";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export default async function TeamEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId) || teamId <= 0) notFound();

  const team = await getTeamById(teamId);
  if (!team) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AdminPageHeader eyebrow="GROUPS" title="그룹 수정" description={team.name}>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/catalog/teams">
            <ArrowLeft className="h-4 w-4" />
            그룹 목록
          </Link>
        </Button>
      </AdminPageHeader>
      <TeamForm mode="edit" team={team} />
    </div>
  );
}
