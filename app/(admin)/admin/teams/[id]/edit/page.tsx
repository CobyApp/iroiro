import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { TeamForm } from "@/modules/teams/components/TeamForm";
import { getTeamById } from "@/modules/teams/lib/queries";

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
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">그룹 수정</h2>
      <TeamForm mode="edit" team={team} />
    </div>
  );
}
