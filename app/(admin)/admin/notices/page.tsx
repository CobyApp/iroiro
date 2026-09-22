import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { listNotices } from "@/modules/notices/lib/queries";
import { NoticesTable } from "@/modules/notices/components/NoticesTable";

export default async function AdminNoticesPage() {
  const notices = await listNotices();

  return (
    <AdminPage>
      <AdminPageHeader title="공지사항" count={notices.length}>
        <Button asChild>
          <Link href="/admin/notices/new">
            <Plus aria-hidden className="mr-0.5 h-4 w-4" />
            신규 공지
          </Link>
        </Button>
      </AdminPageHeader>

      <NoticesTable notices={notices} />
    </AdminPage>
  );
}
