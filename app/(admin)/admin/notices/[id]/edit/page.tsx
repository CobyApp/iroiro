import { notFound } from "next/navigation";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
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
    <AdminPage narrow>
      <AdminPageHeader title="공지 수정" />
      <NoticeForm mode="edit" notice={notice} />
    </AdminPage>
  );
}
