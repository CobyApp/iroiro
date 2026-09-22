import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { Dashboard } from "@/modules/dashboard/components/Dashboard";
import { getDashboardData } from "@/modules/dashboard/lib/queries";

// 대시보드는 site admin 전용 — 게시판 moderator(레이아웃 가드는 통과)는 메뉴에 없는 이 화면 대신
// 자신의 첫 메뉴인 게시판 관리로 보낸다.
export default async function AdminDashboardPage() {
  const account = await getCurrentAccount();
  if (!isAdmin(account)) redirect("/admin/posts");

  const data = await getDashboardData();

  return (
    <AdminPage className="space-y-6">
      <Dashboard data={data} publicBaseUrl={env.R2_PUBLIC_BASE} />
    </AdminPage>
  );
}
