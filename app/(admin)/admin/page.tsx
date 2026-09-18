import { env } from "@/lib/env";
import { Dashboard } from "@/modules/dashboard/components/Dashboard";
import { getDashboardData } from "@/modules/dashboard/lib/queries";

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  return <Dashboard data={data} publicBaseUrl={env.R2_PUBLIC_BASE} />;
}
