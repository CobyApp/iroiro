import { Toaster } from "@/components/ui/sonner";
import { listTeams } from "@/modules/teams/lib/queries";
import { MemberForm } from "@/modules/members/components/MemberForm";

export default async function MemberNewPage() {
  const teams = await listTeams();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">신규 멤버 등록</h2>
      <MemberForm mode="new" teams={teams} />
    </div>
  );
}
