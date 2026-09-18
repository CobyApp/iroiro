import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listNotices } from "@/modules/notices/lib/queries";
import { NoticesTable } from "@/modules/notices/components/NoticesTable";

export default async function AdminNoticesPage() {
  const notices = await listNotices();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">공지사항</h2>
        <Button asChild>
          <Link href="/admin/notices/new">
            <Plus aria-hidden className="mr-0.5 h-4 w-4" />
            신규 공지
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <NoticesTable notices={notices} />
      </div>
    </div>
  );
}
