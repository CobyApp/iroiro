import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { listAdminUsers } from "@/modules/admin/lib/users";
import { UsersTable } from "@/modules/admin/components/UsersTable";

export const metadata: Metadata = { title: "회원 · 등급" };

// 회원 권한 부여·작성 제재 — site admin 전용. 배송·중고·커뮤니티·토레카 관리 권한을 복수로
// 부여/회수하고, 사이트 관리자 지정과 작성 제재도 여기서 한다.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!isAdmin(account)) redirect("/");
  const { q } = await searchParams;
  const users = await listAdminUsers(q);

  return (
    <AdminPage>
      <AdminPageHeader
        title="회원 · 등급"
        count={users.length}
        description="관리 권한(배송·중고·커뮤니티·토레카)을 부여하거나, 사이트 관리자 지정·작성 제재를 해요."
      >
        <form action="/admin/users" className="w-full sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="닉네임 또는 #공개코드"
            aria-label="회원 검색"
            className="h-9 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary/50"
          />
        </form>
      </AdminPageHeader>

      <UsersTable users={users} currentAccountId={account!.id} />
    </AdminPage>
  );
}
