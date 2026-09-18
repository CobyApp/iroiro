import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { MemberForm } from "@/modules/members/components/MemberForm";
import { getMemberById } from "@/modules/members/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { listTeamMembers } from "@/modules/team-members/lib/queries";

export default async function MemberEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memberId = Number(id);
  if (!Number.isInteger(memberId) || memberId <= 0) notFound();

  const [member, teams, memberships] = await Promise.all([
    getMemberById(memberId),
    listTeams(),
    listTeamMembers({ memberId }),
  ]);
  if (!member) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">멤버 수정</h2>
      <MemberForm
        mode="edit"
        member={member}
        teams={teams}
        memberships={memberships}
      />
    </div>
  );
}
