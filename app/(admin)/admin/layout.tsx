import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentAccount } from "@/modules/auth/dal";
import { canEnterAnyAdmin } from "@/modules/admin/lib/adminRoles";

// /admin 하위 전체(대시보드·스토어·중고·커뮤니티·토레카)에 상속되는 베이스 게이트.
// 셸·공간 가드는 두지 않는다 — 각 공간 layout((main)·store·used·posts·catalog)이 자기 AdminShell과
// 세부 권한(isAdmin / hasAdminSpace)을 담당한다. 여기서는 "어떤 관리 공간이든 하나라도 들어갈 수
// 있는가"만 통과시켜, 로그인·최소 권한이 없는 접근을 이른 단계에서 걸러낸다(룰 3).
// Server Action은 layout과 별개로 requireAdmin/requireAdminSpace에서 재검증한다.
export default async function AdminBaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  const account = await getCurrentAccount();
  if (!account) redirect("/login?returnTo=/admin");
  if (!canEnterAnyAdmin(account)) redirect("/");

  return <>{children}</>;
}
