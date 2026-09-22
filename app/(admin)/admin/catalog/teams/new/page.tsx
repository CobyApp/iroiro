import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamForm } from "@/modules/teams/components/TeamForm";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export default function TeamNewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AdminPageHeader eyebrow="GROUPS" title="신규 그룹 등록">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/admin/catalog/teams">
            <ArrowLeft className="h-4 w-4" />
            그룹 목록
          </Link>
        </Button>
      </AdminPageHeader>
      <TeamForm mode="new" />
    </div>
  );
}
