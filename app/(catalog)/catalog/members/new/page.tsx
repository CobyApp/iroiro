import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTeams } from "@/modules/teams/lib/queries";
import { MemberForm } from "@/modules/members/components/MemberForm";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export default async function MemberNewPage() {
  const teams = await listTeams();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AdminPageHeader eyebrow="MEMBERS" title="신규 멤버 등록">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/catalog/members">
            <ArrowLeft className="h-4 w-4" />
            멤버 목록
          </Link>
        </Button>
      </AdminPageHeader>
      <MemberForm mode="new" teams={teams} />
    </div>
  );
}
