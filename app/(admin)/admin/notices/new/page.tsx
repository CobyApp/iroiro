import { Toaster } from "@/components/ui/sonner";
import { NoticeForm } from "@/modules/notices/components/NoticeForm";

export default function NoticeNewPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">신규 공지 등록</h2>
      <NoticeForm mode="new" />
    </div>
  );
}
