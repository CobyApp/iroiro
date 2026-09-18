import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { NoticeForm } from "@/modules/notices/components/NoticeForm";
import { getNoticeById } from "@/modules/notices/lib/queries";

export default async function NoticeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const noticeId = Number(id);
  if (!Number.isInteger(noticeId) || noticeId <= 0) notFound();

  const notice = await getNoticeById(noticeId);
  if (!notice) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <Toaster />
      <h2 className="text-2xl font-bold">공지 수정</h2>
      <NoticeForm mode="edit" notice={notice} />
    </div>
  );
}
