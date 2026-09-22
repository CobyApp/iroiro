import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberForm } from "@/modules/members/components/MemberForm";
import { getMemberById } from "@/modules/members/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { listTeamMembers } from "@/modules/team-members/lib/queries";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

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
    <div className="mx-auto max-w-2xl space-y-4">
      <AdminPageHeader eyebrow="MEMBERS" title="멤버 수정" description={member.name}>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/admin/catalog/members">
            <ArrowLeft className="h-4 w-4" />
            멤버 목록
          </Link>
        </Button>
      </AdminPageHeader>
      <MemberForm
        mode="edit"
        member={member}
        teams={teams}
        memberships={memberships}
      />
    </div>
  );
}
