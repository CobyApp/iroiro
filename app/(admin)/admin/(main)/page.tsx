import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { Dashboard } from "@/modules/dashboard/components/Dashboard";
import { PendingWork } from "@/modules/dashboard/components/PendingWork";
import { getDashboardData } from "@/modules/dashboard/lib/queries";
import { getPendingWork } from "@/modules/dashboard/lib/pending-work";

// 대시보드는 site admin 전용. 레이아웃 가드가 이미 site admin 만 통과시키지만(모더레이터는 /admin/posts로),
// Server Component 방어선으로 한 번 더 확인해 비-admin은 게시판 공간으로 보낸다.
export default async function AdminDashboardPage() {
  const account = await getCurrentAccount();
  if (!isAdmin(account)) redirect("/admin/posts");

  const [data, pendingWork] = await Promise.all([
    getDashboardData(),
    getPendingWork(),
  ]);

  return (
    <AdminPage className="space-y-6">
      <PendingWork items={pendingWork} />
      <Dashboard data={data} publicBaseUrl={env.R2_PUBLIC_BASE} />
    </AdminPage>
  );
}
